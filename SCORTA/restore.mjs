import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,existsSync,mkdirSync,readFileSync,renameSync,rmSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {defaultDatabase,validateDatabase,validateState} from './backup.mjs';

export function restoreBackup(input,{target=defaultDatabase(),offline=false}={}){
  if(!offline)throw Error('Detén SCORTA y confirma la restauración con --offline');
  input=resolve(input);target=resolve(target);
  if(input===target)throw Error('El origen y el destino deben ser diferentes');
  if(existsSync(target+'-wal')||existsSync(target+'-shm'))throw Error('Hay archivos WAL/SHM. Detén el servidor y cierra la base antes de restaurar.');
  const header=readFileSync(input).subarray(0,16).toString();
  const full=header==='SQLite format 3\0';
  const state=full?null:validateState(JSON.parse(readFileSync(input,'utf8')));
  if(full)validateDatabase(input);
  mkdirSync(dirname(target),{recursive:true});
  const stage=target+'.restore-'+randomUUID();
  let previous=null;
  try{
    if(existsSync(target)){
      previous=target+'.'+new Date().toISOString().replaceAll(':','-')+'.'+randomUUID()+'.bak';
      copyFileSync(target,previous);chmodSync(previous,0o600);
    }
    if(full){copyFileSync(input,stage);chmodSync(stage,0o600);validateDatabase(stage)}
    else{
      // Legacy JSON contains business data only; existing accounts are preserved.
      if(existsSync(target))copyFileSync(target,stage);
      const db=new DatabaseSync(stage);
      try{
        db.exec('PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS app(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');
        db.prepare('INSERT OR REPLACE INTO app VALUES(1,?)').run(JSON.stringify(state));
        if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='requests'").get())db.exec('DELETE FROM requests');
        db.exec('COMMIT');
      }finally{db.close()}
      chmodSync(stage,0o600);
    }
    renameSync(stage,target);
    return {full,previous,target};
  }finally{for(const suffix of ['','-wal','-shm','-journal'])rmSync(stage+suffix,{force:true})}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),input=args.find(x=>x!=='--offline');
  if(!input||args.length!==2||!args.includes('--offline'))throw Error('Uso: node restore.mjs archivo.sqlite|archivo.json --offline (servidor detenido)');
  const result=restoreBackup(input,{offline:true});
  console.log(result.full?'Respaldo SQLite completo restaurado':'Restauración JSON parcial: no recupera usuarios ni claves de reintento; conserva usuarios existentes y elimina claves antiguas');
  if(result.previous)console.log('Copia anterior conservada: '+result.previous);
}
