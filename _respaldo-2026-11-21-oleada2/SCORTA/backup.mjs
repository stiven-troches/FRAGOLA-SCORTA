import {DatabaseSync, backup} from 'node:sqlite';
import {chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const root=dirname(fileURLToPath(import.meta.url));
export const defaultDatabase=()=>resolve(process.env.DATA_DIR||resolve(root,'data'),'motoshop.sqlite');

export function validateState(state){
  for(const key of ['prods','compras','ventas','servs','movimientos'])
    if(!Array.isArray(state?.[key]))throw Error('Respaldo inválido: '+key);
  if(!Number.isSafeInteger(state.revision)||state.revision<0)throw Error('Revisión inválida');
  const ids=new Set();
  for(const p of state.prods){
    if(!p.id||ids.has(p.id)||typeof p.nombre!=='string'||!Number.isSafeInteger(p.stock)||p.stock<0)throw Error('Producto inválido');
    ids.add(p.id);
  }
  return state;
}

export function validateDatabase(file){
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Base SQLite dañada');
    for(const [table,columns] of Object.entries({app:['id','data'],users:['username','role','salt','digest','active'],requests:['id','fingerprint']})){
      const actual=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
      if(columns.some(column=>!actual.includes(column)))throw Error('Respaldo completo inválido: '+table);
    }
    validateState(JSON.parse(db.prepare('SELECT data FROM app WHERE id=1').get()?.data));
  }finally{db.close()}
}

// Online backup includes committed WAL changes in one consistent SQLite snapshot.
export async function createFullBackup(source=defaultDatabase()){
  let owned=false,db=source;
  if(typeof source==='string'){
    if(!existsSync(source)||!statSync(source).isFile())throw Error('La base de datos de origen no existe');
    db=new DatabaseSync(source,{readOnly:true});owned=true;
  }
  const temp=mkdtempSync(resolve(tmpdir(),'scorta-backup-'));
  const file=resolve(temp,'snapshot.sqlite');
  try{
    await backup(db,file);chmodSync(file,0o600);validateDatabase(file);
    return readFileSync(file);
  }finally{if(owned)db.close();rmSync(temp,{recursive:true,force:true})}
}

export async function saveFullBackup(directory,{source=defaultDatabase(),keep=30}={}){
  if(!Number.isSafeInteger(keep)||keep<2)throw Error('La retención debe conservar al menos 2 respaldos');
  const folder=resolve(directory);mkdirSync(folder,{recursive:true,mode:0o700});
  const name=`scorta-${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}.sqlite`;
  const target=resolve(folder,name),pending=target+'.tmp';
  try{
    writeFileSync(pending,await createFullBackup(source),{flag:'wx',mode:0o600});
    linkSync(pending,target);unlinkSync(pending);
  }finally{rmSync(pending,{force:true})}
  const pattern=/^scorta-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-f0-9-]{36}\.sqlite$/;
  const files=readdirSync(folder).filter(n=>pattern.test(n)&&statSync(resolve(folder,n)).isFile()).sort().reverse();
  for(const file of files.slice(keep))unlinkSync(resolve(folder,file));
  return target;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [folder,flag,count]=process.argv.slice(2);
  if(!folder||(flag&&flag!=='--keep')||(flag&&!count)||process.argv.length>5)throw Error('Uso: node backup.mjs directorio [--keep 30]');
  console.log('Respaldo completo creado: '+await saveFullBackup(folder,{keep:count===undefined?30:Number(count)}));
}
