import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync,renameSync,rmSync,chmodSync,statSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePlatformDatabase} from './platform-server.mjs';
import {snapshotForRestore} from './sqlite-restore-snapshot.mjs';

// Copies of a WAL database inherit journal_mode=WAL; a standalone backup file must be
// self-contained, so switch it to DELETE (no -wal/-shm next to the copy).
async function copyDatabase(source,pending){
  const db=new DatabaseSync(source,{readOnly:true});
  try{await backup(db,pending);}finally{db.close();}
  const copy=new DatabaseSync(pending);try{copy.exec('PRAGMA journal_mode=DELETE');}finally{copy.close();}
  validatePlatformDatabase(pending);try{chmodSync(pending,0o600);}catch{}
}
const dropPending=pending=>{for(const suffix of ['','-wal','-shm','-journal'])rmSync(pending+suffix,{force:true});};
export async function savePlatformBackup(source,directory){
  if(!existsSync(source))throw Error('La base de plataforma no existe');
  validatePlatformDatabase(source);mkdirSync(directory,{recursive:true,mode:0o700});
  const target=resolve(directory,'scorta-platform-'+new Date().toISOString().replaceAll(':','-')+'-'+crypto.randomUUID()+'.sqlite'),pending=target+'.tmp';
  try{await copyDatabase(source,pending);renameSync(pending,target);return target;}finally{dropPending(pending);}
}
// BE-02: consistent copy taken before the server opens the database on every start
// (each deploy). Keeps the newest `keep` startup copies; returns null if there is no
// database yet. Works with a leftover WAL from a killed instance (read via SQLite).
export async function startupBackup(source,directory,{keep=5,now=new Date()}={}){
  if(!existsSync(source))return null;
  mkdirSync(directory,{recursive:true,mode:0o700});
  const target=resolve(directory,'startup-'+now.toISOString().replaceAll(':','-')+'.sqlite'),pending=target+'.tmp';
  try{await copyDatabase(source,pending);renameSync(pending,target);}finally{dropPending(pending);}
  for(const old of readdirSync(directory).filter(name=>/^startup-.*\.sqlite$/.test(name)).sort().reverse().slice(Math.max(1,keep)))rmSync(resolve(directory,old),{force:true});
  return target;
}
export function restorePlatformBackup(source,target,{offline=false}={}){
  if(!offline)throw Error('Detén el servidor y confirma --offline antes de restaurar');
  source=resolve(source);target=resolve(target);
  if(source===target)throw Error('El origen y el destino deben ser diferentes');
  validatePlatformDatabase(source);
  const pidFile=target+'.pid';
  if(existsSync(pidFile)){const pid=Number(readFileSync(pidFile,'utf8'));let running=false;if(Number.isSafeInteger(pid)&&pid>0){try{process.kill(pid,0);running=true;}catch(error){running=error.code==='EPERM';}}if(running)throw Error('La plataforma está abierta; detén el servidor antes de restaurar');}
  for(const sidecar of [target+'-wal',target+'-shm'])if(existsSync(sidecar)&&statSync(sidecar).size)throw Error('Existen archivos WAL/SHM; completa el cierre limpio del servidor antes de restaurar');
  mkdirSync(dirname(target),{recursive:true,mode:0o700});const pending=target+'.restore-'+crypto.randomUUID();
  try{
    snapshotForRestore(source,pending);
    const db=new DatabaseSync(pending);try{const state=JSON.parse(db.prepare('SELECT data FROM platform WHERE id=1').get().data);state.sessions={};state.saleDrafts={};db.prepare('UPDATE platform SET data=?,storage_version=storage_version+1 WHERE id=1').run(JSON.stringify(state));}finally{db.close();}
    validatePlatformDatabase(pending);
    // BE-03: empty WAL/SHM of the old database must not be paired with the new file.
    for(const sidecar of [target+'-wal',target+'-shm'])rmSync(sidecar,{force:true});
    let previous=null;if(existsSync(target)){previous=target+'.previous-'+Date.now();renameSync(target,previous);}
    try{renameSync(pending,target);}catch(error){if(previous)renameSync(previous,target);throw error;}
    rmSync(pidFile,{force:true});return {target,previous};
  }finally{for(const suffix of ['','-wal','-shm','-journal'])rmSync(pending+suffix,{force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command,first,second,flag]=process.argv.slice(2);
  if(command==='save'&&first&&second&&!flag)console.log(await savePlatformBackup(resolve(first),resolve(second)));
  else if(command==='restore'&&first&&second&&flag==='--offline')console.log(JSON.stringify(restorePlatformBackup(resolve(first),resolve(second),{offline:true})));
  else if(command==='decrypt'&&first&&second&&!flag){const {decryptBackup}=await import('./ops/offsite-backup.mjs');const out=resolve(second);if(existsSync(out))throw Error('El archivo de salida ya existe');writeFileSync(out,decryptBackup(readFileSync(resolve(first)),process.env.SCORTA_BACKUP_KEY),{flag:'wx',mode:0o600});validatePlatformDatabase(out);console.log(out);}
  else throw Error('Uso: node platform-backup.mjs save archivo-platform.sqlite carpeta | restore respaldo.sqlite destino-platform.sqlite --offline | decrypt respaldo.sqlite.enc salida.sqlite (usa SCORTA_BACKUP_KEY)');
}
