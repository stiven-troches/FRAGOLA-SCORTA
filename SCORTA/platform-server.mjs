import {seedTestCompany} from './test-company.mjs';
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
// A lock file left by a killed instance (SIGKILL on redeploy, OOM, power loss) must
// not block startup. In containers PIDs are reused: the stale PID can be this very
// process or an unrelated one, so only a live *node* process other than us counts.
function lockHolderRunning(pid){
  if(!Number.isSafeInteger(pid)||pid<=0||pid===process.pid)return false;
  try{process.kill(pid,0);}catch(error){if(error.code!=='EPERM')return false;}
  try{return /node/i.test(readFileSync(`/proc/${pid}/cmdline`,'utf8'));}catch{return true;}
}
export async function openPlatformStore(file,{owner,ownerContact='',legacyState,withTestCompany=false}={}){
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const pidFile=file+'.pid';
  if(existsSync(pidFile)){if(lockHolderRunning(Number(readFileSync(pidFile,'utf8'))))throw Error('La plataforma ya está abierta. Detén la instancia antes de abrir otra.');rmSync(pidFile,{force:true});}
  writeFileSync(pidFile,String(process.pid),{flag:'wx',mode:0o600});
  const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS platform(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, storage_version INTEGER NOT NULL DEFAULT 0)');
  try{
    const prior=db.prepare('SELECT data FROM platform WHERE id=1').get();
    let state=prior?JSON.parse(prior.data):await createPlatform({owner,ownerContact,legacyState});
    state.sessions??={};if(ownerContact)state.ownerContact=ownerContact;
    if(withTestCompany)state=await seedTestCompany(state);
    if(!prior)db.prepare('INSERT INTO platform(id,data) VALUES(1,?)').run(JSON.stringify(state));
    else db.prepare('UPDATE platform SET data=?,storage_version=storage_version+1 WHERE id=1').run(JSON.stringify(state));
    try{chmodSync(file,0o600);}catch{}
  }catch(error){db.close();rmSync(pidFile,{force:true});throw error;}
  // BE-10: the parsed state is cached by storage_version. Writers clone before mutating
  // (platformRequest structuredClones on POST; GET handlers are read-only), so a cached
  // object is never modified and reads skip both JSON.parse and the global write queue.
  // Every commit is guarded by storage_version: a read overlapping a write simply sees
  // the previous consistent snapshot, and a stale write gets REVISION_CONFLICT.
  let queue=Promise.resolve(),closed=false,cache={version:-1,state:null};
  const versionStmt=db.prepare('SELECT storage_version FROM platform WHERE id=1'),rowStmt=db.prepare('SELECT data,storage_version FROM platform WHERE id=1');
  function current(){const version=versionStmt.get().storage_version;if(cache.version===version)return cache;const row=rowStmt.get();cache={version:row.storage_version,state:JSON.parse(row.data)};return cache;}
  async function operation(payload,options){
    if(closed)throw Error('La plataforma está cerrada');
    const snap=current(),result=await platformRequest(snap.state,payload,options);
    if(result.state!==snap.state){
      if(closed)throw Error('La plataforma está cerrada');
      db.exec('BEGIN IMMEDIATE');
      try{const changed=db.prepare('UPDATE platform SET data=?,storage_version=storage_version+1 WHERE id=1 AND storage_version=?').run(JSON.stringify(result.state),snap.version);if(!changed.changes){db.exec('ROLLBACK');return {status:409,body:{error:'Otra solicitud actualizó los datos. Reintenta la operación.',code:'REVISION_CONFLICT'}};}db.exec('COMMIT');cache={version:snap.version+1,state:result.state};}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    }
    const {state,...publicResult}=result;return publicResult;
  }
  function request(payload,options){
    if(['GET','HEAD'].includes(String(payload?.method||'GET').toUpperCase()))return operation(payload,options);
    const result=queue.then(()=>operation(payload,options));queue=result.catch(()=>{});return result;
  }
  const stats=()=>({sizeBytes:db.prepare('PRAGMA page_count').get().page_count*db.prepare('PRAGMA page_size').get().page_size,stateBytes:db.prepare('SELECT length(CAST(data AS BLOB)) AS n FROM platform WHERE id=1').get().n});
  return {request,stats,health:()=>!closed&&db.prepare('SELECT 1 AS ok').get().ok===1,readPrivate:()=>JSON.parse(db.prepare('SELECT data FROM platform WHERE id=1').get().data),async snapshot(){await queue;const directory=mkdtempSync(resolve(tmpdir(),'scorta-platform-')),target=resolve(directory,'platform.sqlite');try{await backup(db,target);validatePlatformDatabase(target);return readFileSync(target);}finally{rmSync(directory,{recursive:true,force:true});}},close(){closed=true;db.close();rmSync(pidFile,{force:true});}};
}
// SEG-02: x-forwarded-for is appended by every proxy, so only the entry added by our
// own trusted proxy (counted from the right) is reliable; the leftmost one is whatever
// the client sent. Single-value headers set by the edge (cf-connecting-ip,
// true-client-ip) are used whole.
export function clientAddressFrom(req,header,hops=1){
  const fallback=String(req.socket?.remoteAddress||'unknown');if(!header)return fallback;
  const raw=req.headers[header],value=String(Array.isArray(raw)?raw.join(','):raw||'');
  let ip;if(header==='x-forwarded-for'){const list=value.split(',').map(v=>v.trim()).filter(Boolean),n=Number.isSafeInteger(hops)&&hops>0?hops:1;ip=list[Math.max(0,list.length-n)];}else ip=value.trim();
  return ip&&ip.length<=100?ip:fallback;
}
const IP_HEADERS=['x-forwarded-for','x-real-ip','cf-connecting-ip','true-client-ip','forwarded','x-client-ip','cf-ipcountry','x-forwarded-proto','via'];
// SCORTA_LOG_IP_HEADERS=1: one log line with only the IP-related headers (never cookies).
export const ipHeaderDiagnostics=req=>({level:'info',at:new Date().toISOString(),event:'ip-headers',path:String(req.url||'').split('?')[0].replace(/\/receipt\/[A-Za-z0-9_-]{43}/,'/receipt/[token]'),socket:req.socket?.remoteAddress||null,headers:Object.fromEntries(IP_HEADERS.filter(h=>req.headers[h]!=null).map(h=>[h,req.headers[h]]))});
// SEG-13: mailer = createMailer() de ops/mailer.mjs. Los correos salen solo si hay proveedor
// configurado Y SCORTA_PUBLIC_URL (el enlace nunca se arma con la cabecera Host del cliente).
// Se envían después de confirmar la escritura y sin esperar, para que el tiempo de respuesta
// no revele si la cuenta existe.
export function createPlatformHandler({store,production=false,publicUrl,clock=Date.now,clientIpHeader,trustedProxyHops=1,requireTerms=false,requireDataConsent=false,mailer=null,onMail=null}={}){
  const mailEnabled=!!(mailer?.enabled&&publicUrl),resetBaseUrl=publicUrl?new URL(publicUrl).origin:undefined;
  const limitedPaths=new Set(['/api/v2/login','/api/v2/password/forgot','/api/v2/password/reset']);
  const cookie=(value,age)=>`${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production?'; Secure':''}`;
  // Bound unauthenticated work before reading a body or opening the global JSON
  // state. The origin comes from the socket, never a client-supplied proxy header,
  // unless the operator names the header its trusted proxy sets (Render/Cloudflare:
  // SCORTA_CLIENT_IP_HEADER). Behind a proxy the socket address is the proxy's, which
  // would turn every per-origin limit into one global lockout.
  const ipHeader=typeof clientIpHeader==='string'&&clientIpHeader.trim()?clientIpHeader.trim().toLowerCase():null;
  const hops=Math.trunc(Number(trustedProxyHops))||1,clientAddress=req=>clientAddressFrom(req,ipHeader,hops);
  const loginOrigins=new Map(),loginWindowMs=60000,loginOriginLimit=120,maxOrigins=1000;
  return async(req,res)=>{
    const url=new URL(req.url,'http://localhost'),path=url.pathname;if(!path.startsWith('/api/v2/'))return false;
    try{
      const protocol=production||req.socket.encrypted?'https':'http';
      const origin=publicUrl?new URL(publicUrl).origin:`${protocol}://${req.headers.host}`;
      if(!['GET','HEAD','OPTIONS'].includes(req.method)){
        if(req.headers.origin!==origin){json(res,403,{error:'Origen no autorizado',code:'INVALID_ORIGIN'});return true;}
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){json(res,415,{error:'La solicitud debe utilizar JSON'});return true;}
      }
      if(!store){json(res,503,{error:'Configura SCORTA_OWNER_PASSWORD para preparar la plataforma',code:'SETUP_REQUIRED'});return true;}
      if(limitedPaths.has(path)&&req.method==='POST'){
        const timestamp=Number(clock());
        for(const [key,value]of loginOrigins)if(value.until<=timestamp)loginOrigins.delete(key);
        const key=clientAddress(req),previous=loginOrigins.get(key);
        if(previous&&previous.count>=loginOriginLimit){const retryAfterSeconds=Math.max(1,Math.ceil((previous.until-timestamp)/1000));res.setHeader('Retry-After',String(retryAfterSeconds));json(res,429,{error:'Demasiados intentos desde este origen. Espera un minuto.',code:'RATE_LIMITED',retryAfterSeconds});return true;}
        if(!previous&&loginOrigins.size>=maxOrigins)loginOrigins.delete(loginOrigins.keys().next().value);
        loginOrigins.set(key,{count:(previous?.count||0)+1,until:previous?.until||timestamp+loginWindowMs});
      }
      let body;
      if(req.method==='POST'){
        const chunks=[],limit=limitedPaths.has(path)?8192:2000000;let size=0;
        for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>limit){json(res,413,{error:'La solicitud es demasiado grande'});return true;}chunks.push(bytes);}
        try{body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{json(res,400,{error:'Datos JSON inválidos'});return true;}
      }
      const match=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));
      const token=match?.slice(COOKIE.length+1);
      const hasContext=Object.hasOwn(req.headers,'x-scorta-company');
      const result=await store.request({method:req.method,path:path+url.search,body,token:/^[A-Za-z0-9_-]{43}$/.test(token||'')?token:null,clientKey:clientAddress(req),enforceContext:true,...(hasContext?{expectedCompanyId:req.headers['x-scorta-company']}:{})},{baseUrl:origin,...(requireTerms?{requireTerms:true}:{}),...(requireDataConsent?{requireDataConsent:true}:{}),...(mailEnabled?{mailEnabled:true,resetBaseUrl}:{})});
      if(mailEnabled&&Array.isArray(result.outbox)&&result.outbox.length){const sending=mailer.sendAll(result.outbox).catch(()=>[]);onMail?.(sending);}
      if(Object.hasOwn(result,'token'))res.setHeader('Set-Cookie',cookie(result.token||'',result.token?Math.floor(PLATFORM_SESSION_TTL_MS/1000):0));
      else if(result.status===401&&token)res.setHeader('Set-Cookie',cookie('',0));
      if(result.status===429&&Number.isFinite(result.body?.retryAfterSeconds))res.setHeader('Retry-After',String(result.body.retryAfterSeconds));
      if(req.method==='GET'&&/^\/api\/v2\/catalog\/[^/]+\/photo\/[^/]+$/.test(path)&&result.status===200){
        const image=result.body.image?.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+=*)$/);
        if(!image){json(res,404,{error:'Imagen no disponible'});return true;}
        res.setHeader('Content-Type',image[1]);res.end(Buffer.from(image[2],'base64'));return true;
      }
      json(res,result.status,result.body);return true;
    }catch(error){
      // Expected failures carry a status; anything else is an internal fault: log it
      // and never expose its message (SQLite/Node internals) to the client.
      if(error.status){json(res,error.status,{error:error.message||'No se pudo completar la solicitud'});return true;}
      console.error(JSON.stringify({level:'error',at:new Date().toISOString(),method:req.method,path,error:String(error?.stack||error)}));
      json(res,500,{error:'Error interno del servidor. Intenta de nuevo.',code:'INTERNAL_ERROR'});return true;
    }
  };
}
