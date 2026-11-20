import {DatabaseSync, backup} from 'node:sqlite';
import {mkdirSync,existsSync,readFileSync,writeFileSync,rmSync,chmodSync,mkdtempSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createPlatform,platformRequest,PLATFORM_SESSION_TTL_MS} from './platform.mjs';

const COOKIE='scorta_platform';
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
export function validatePlatformDatabase(file){
  const db=new DatabaseSync(file,{readOnly:true});
  try{if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Respaldo de plataforma dañado');const row=db.prepare('SELECT data FROM platform WHERE id=1').get();const state=JSON.parse(row?.data||'null');if(state?.schemaVersion!==1||!Array.isArray(state.users)||!Array.isArray(state.companies)||!state.businesses)throw Error('El archivo no contiene una plataforma SCORTA válida');return state;}finally{db.close();}
}
export async function openPlatformStore(file,{owner,ownerContact='',legacyState}={}){
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const pidFile=file+'.pid';
  if(existsSync(pidFile)){const previous=Number(readFileSync(pidFile,'utf8'));let running=false;if(Number.isSafeInteger(previous)&&previous>0){try{process.kill(previous,0);running=true;}catch(error){running=error.code==='EPERM';}}if(running)throw Error('La plataforma ya está abierta. Detén la instancia antes de abrir otra.');rmSync(pidFile,{force:true});}
  writeFileSync(pidFile,String(process.pid),{flag:'wx',mode:0o600});
  const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS platform(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, storage_version INTEGER NOT NULL DEFAULT 0)');
  try{
    const prior=db.prepare('SELECT data FROM platform WHERE id=1').get();
    if(!prior){const initial=await createPlatform({owner,ownerContact,legacyState});db.prepare('INSERT INTO platform(id,data) VALUES(1,?)').run(JSON.stringify(initial));}
    else{const state=JSON.parse(prior.data);state.sessions??={};if(ownerContact)state.ownerContact=ownerContact;db.prepare('UPDATE platform SET data=?,storage_version=storage_version+1 WHERE id=1').run(JSON.stringify(state));}
    try{chmodSync(file,0o600);}catch{}
  }catch(error){db.close();rmSync(pidFile,{force:true});throw error;}
  let queue=Promise.resolve(),closed=false;
  function request(payload,options){
    const operation=async()=>{
      if(closed)throw Error('La plataforma está cerrada');
      const row=db.prepare('SELECT data,storage_version FROM platform WHERE id=1').get(),current=JSON.parse(row.data);
      const result=await platformRequest(current,payload,options);
      if(result.state!==current){
        db.exec('BEGIN IMMEDIATE');
        try{const changed=db.prepare('UPDATE platform SET data=?,storage_version=storage_version+1 WHERE id=1 AND storage_version=?').run(JSON.stringify(result.state),row.storage_version);if(!changed.changes){db.exec('ROLLBACK');return {status:409,body:{error:'Otra solicitud actualizó los datos. Reintenta la operación.',code:'REVISION_CONFLICT'}};}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      }
      const {state,...publicResult}=result;return publicResult;
    };
    const result=queue.then(operation);queue=result.catch(()=>{});return result;
  }
  return {request,readPrivate:()=>JSON.parse(db.prepare('SELECT data FROM platform WHERE id=1').get().data),async snapshot(){await queue;const directory=mkdtempSync(resolve(tmpdir(),'scorta-platform-')),target=resolve(directory,'platform.sqlite');try{await backup(db,target);validatePlatformDatabase(target);return readFileSync(target);}finally{rmSync(directory,{recursive:true,force:true});}},close(){closed=true;db.close();rmSync(pidFile,{force:true});}};
}
export function createPlatformHandler({store,production=false,publicUrl}={}){
  const cookie=(value,age)=>`${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production?'; Secure':''}`;
  return async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/api/v2/'))return false;
    try{
      const protocol=production||req.socket.encrypted?'https':'http';
      const origin=publicUrl?new URL(publicUrl).origin:`${protocol}://${req.headers.host}`;
      if(!['GET','HEAD','OPTIONS'].includes(req.method)){
        if(req.headers.origin!==origin){json(res,403,{error:'Origen no autorizado',code:'INVALID_ORIGIN'});return true;}
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){json(res,415,{error:'La solicitud debe utilizar JSON'});return true;}
      }
      if(!store){json(res,503,{error:'Configura SCORTA_OWNER_PASSWORD para preparar la plataforma',code:'SETUP_REQUIRED'});return true;}
      let body;
      if(req.method==='POST'){
        let source='';for await(const chunk of req){source+=chunk;if(Buffer.byteLength(source)>2000000){json(res,413,{error:'La solicitud es demasiado grande'});return true;}}
        try{body=JSON.parse(source||'{}');}catch{json(res,400,{error:'Datos JSON inválidos'});return true;}
      }
      const match=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));
      const token=match?.slice(COOKIE.length+1);
      const result=await store.request({method:req.method,path,body,token:/^[A-Za-z0-9_-]{43}$/.test(token||'')?token:null,clientKey:req.socket.remoteAddress},{baseUrl:origin});
      if(Object.hasOwn(result,'token'))res.setHeader('Set-Cookie',cookie(result.token||'',result.token?Math.floor(PLATFORM_SESSION_TTL_MS/1000):0));
      else if(result.status===401&&token)res.setHeader('Set-Cookie',cookie('',0));
      json(res,result.status,result.body);return true;
    }catch(error){json(res,error.status||400,{error:error.message||'No se pudo completar la solicitud'});return true;}
  };
}
