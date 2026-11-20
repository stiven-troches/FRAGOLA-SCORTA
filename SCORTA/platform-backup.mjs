import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,rmSync,chmodSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePlatformDatabase} from './platform-server.mjs';

export async function savePlatformBackup(source,directory){
  if(!existsSync(source))throw Error('La base de plataforma no existe');
  validatePlatformDatabase(source);mkdirSync(directory,{recursive:true,mode:0o700});
  const target=resolve(directory,'scorta-platform-'+new Date().toISOString().replaceAll(':','-')+'-'+crypto.randomUUID()+'.sqlite'),pending=target+'.tmp';
  const db=new DatabaseSync(source,{readOnly:true});
  try{await backup(db,pending);validatePlatformDatabase(pending);chmodSync(pending,0o600);renameSync(pending,target);return target;}finally{db.close();rmSync(pending,{force:true});}
}
export function restorePlatformBackup(source,target,{offline=false}={}){
  if(!offline)throw Error('Detén el servidor y confirma --offline antes de restaurar');
  validatePlatformDatabase(source);
  const pidFile=target+'.pid';
  if(existsSync(pidFile)){const pid=Number(readFileSync(pidFile,'utf8'));let running=false;if(Number.isSafeInteger(pid)&&pid>0){try{process.kill(pid,0);running=true;}catch(error){running=error.code==='EPERM';}}if(running)throw Error('La plataforma está abierta; detén el servidor antes de restaurar');}
  for(const sidecar of [target+'-wal',target+'-shm'])if(existsSync(sidecar)&&statSync(sidecar).size)throw Error('Existen archivos WAL/SHM; completa el cierre limpio del servidor antes de restaurar');
  mkdirSync(dirname(target),{recursive:true,mode:0o700});const pending=target+'.restore-'+crypto.randomUUID();
  try{
    writeFileSync(pending,readFileSync(source),{flag:'wx',mode:0o600});
    const db=new DatabaseSync(pending);try{const state=JSON.parse(db.prepare('SELECT data FROM platform WHERE id=1').get().data);state.sessions={};db.prepare('UPDATE platform SET data=?,storage_version=storage_version+1 WHERE id=1').run(JSON.stringify(state));}finally{db.close();}
    validatePlatformDatabase(pending);
    let previous=null;if(existsSync(target)){previous=target+'.previous-'+Date.now();renameSync(target,previous);}
    try{renameSync(pending,target);}catch(error){if(previous)renameSync(previous,target);throw error;}
    rmSync(pidFile,{force:true});return {target,previous};
  }finally{rmSync(pending,{force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command,first,second,flag]=process.argv.slice(2);
  if(command==='save'&&first&&second&&!flag)console.log(await savePlatformBackup(resolve(first),resolve(second)));
  else if(command==='restore'&&first&&second&&flag==='--offline')console.log(JSON.stringify(restorePlatformBackup(resolve(first),resolve(second),{offline:true})));
  else throw Error('Uso: node platform-backup.mjs save archivo-platform.sqlite carpeta | restore respaldo.sqlite destino-platform.sqlite --offline');
}
