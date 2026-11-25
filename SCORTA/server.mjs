import {catalogHead} from './catalog.mjs';
import {passwordPolicyError} from './password-policy.mjs';
import {DatabaseSync} from 'node:sqlite';
import {aplicarCambio, estadoVacio} from './inventory.mjs';
import {mkdirSync,readFileSync,existsSync,statSync,statfsSync} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {brotliCompressSync,gzipSync,constants as zlibConstants} from 'node:zlib';
import {timingSafeEqual,createHash,scryptSync,randomBytes} from 'node:crypto';
import {createAuth} from './auth.mjs';
import {createFullBackup} from './backup.mjs';
import {consultarProductos, consultarMovimientos} from './consultas.mjs';
import {openPlatformStore,createPlatformHandler,ipHeaderDiagnostics} from './platform-server.mjs';
import {testCompanyEnabled} from './test-company.mjs';
import {startupBackup} from './platform-backup.mjs';
import {startOffsiteBackup} from './ops/offsite-backup.mjs';
import {createMailer} from './ops/mailer.mjs';
const root=dirname(fileURLToPath(import.meta.url));
// Archivos de texto (JS, CSS, HTML, SVG, JSON) comprimidos con brotli o gzip; se guardan en
// memoria por ruta y fecha de modificación para no recomprimir en cada visita.
const COMPRESSIBLE=/\.(?:js|mjs|css|html|svg|json|webmanifest|txt)$/i,compressedCache=new Map();
export function compressStatic(req,res,file,contents,cacheable=true){
 if(!COMPRESSIBLE.test(file)||contents.length<1024)return contents;
 const accepted=String(req.headers['accept-encoding']||''),encoding=/\bbr\b/.test(accepted)?'br':/\bgzip\b/.test(accepted)?'gzip':'';
 res.setHeader('Vary','Accept-Encoding');if(!encoding)return contents;
 let key='';if(cacheable){try{key=file+'|'+statSync(file).mtimeMs+'|'+encoding}catch{}}
 let body=key&&compressedCache.get(key);
 if(!body){body=encoding==='br'?brotliCompressSync(contents,{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:cacheable?9:4}}):gzipSync(contents,{level:cacheable?9:6});if(key){if(compressedCache.size>=300)compressedCache.delete(compressedCache.keys().next().value);compressedCache.set(key,body)}}
 res.setHeader('Content-Encoding',encoding);return body;
}
// Fallos de programación (no de validación): 500 sin detalles internos y con traza en el log.
export const isProgrammingError=error=>error instanceof TypeError||error instanceof ReferenceError||error instanceof RangeError||error instanceof SyntaxError&&!/JSON/.test(error.message);
// /healthz público solo dice si el servicio está bien; el detalle (base, disco, latencia,
// respaldos) exige `Authorization: Bearer <SCORTA_HEALTH_TOKEN>`.
export function healthDetailAllowed(req,token=process.env.SCORTA_HEALTH_TOKEN){
 if(!token||token.length<16)return false;
 const given=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');
 const a=createHash('sha256').update(given).digest(),b=createHash('sha256').update(token).digest();
 return timingSafeEqual(a,b);
}
export function openStore(file){
 mkdirSync(dirname(file),{recursive:true});const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, role TEXT NOT NULL, salt TEXT NOT NULL, digest TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)');
 const empty=estadoVacio();
 db.prepare('INSERT OR IGNORE INTO app VALUES(1,?)').run(JSON.stringify(empty));
 const read=()=>JSON.parse(db.prepare('SELECT data FROM app WHERE id=1').get().data);
 function addUser(username,password,role){if(!listUsers().length&&role!=='admin')throw Error('La primera cuenta debe ser administradora para poder gestionar el almacén. Selecciona Administrador.');if(!/^[a-zA-Z0-9._-]{3,60}$/.test(username)||!['admin','operador'].includes(role))throw Error('Usuario o rol inválidos');const policyError=passwordPolicyError(password);if(policyError)throw Error(policyError);const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,64).toString('hex');db.prepare('INSERT INTO users(username,role,salt,digest) VALUES(?,?,?,?)').run(username,role,salt,digest)}
 function verifyUser(username,password){const u=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);if(!u)return null;const actual=scryptSync(password,u.salt,64), expected=Buffer.from(u.digest,'hex');return timingSafeEqual(actual,expected)?{username:u.username,role:u.role}:null}
 function setUserPassword(username,password){const policyError=passwordPolicyError(password);if(policyError)throw Error(policyError);const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,64).toString('hex');const result=db.prepare('UPDATE users SET salt=?, digest=? WHERE username=? AND active=1').run(salt,digest,username);if(!result.changes)throw Error('Usuario inexistente');}
 function listUsers(){return db.prepare('SELECT username,role,active FROM users ORDER BY username').all()}
 function change(a,actor='local') {
  db.exec('BEGIN IMMEDIATE');
  try {
   const current=read();
   const fingerprint=createHash('sha256').update(JSON.stringify({kind:a.kind,form:a.form,items:a.items,id:a.id})).digest('hex');
   if(a.requestId){
    const prev=db.prepare('SELECT fingerprint FROM requests WHERE id=?').get(a.requestId);
    if(prev){
     if(prev.fingerprint!==fingerprint)throw Error('El identificador de operación ya fue usado con otros datos');
     db.exec('COMMIT');return current;
    }
   }
   const next=aplicarCambio(current,a,actor);
   if(a.requestId)db.prepare('INSERT INTO requests VALUES(?,?)').run(a.requestId,fingerprint);
   db.prepare('UPDATE app SET data=? WHERE id=1').run(JSON.stringify(next));
   db.exec('COMMIT');return next;
  } catch(e) {db.exec('ROLLBACK');throw e}
 }

 return {read,change,addUser,verifyUser,setUserPassword,listUsers,fullBackup:()=>createFullBackup(db),close:()=>db.close()};
}
// Ops lines go to stderr (Render collects both): stdout's first line announces readiness.
const opsLog=(level,event,extra={})=>console.error(JSON.stringify({level,at:new Date().toISOString(),event,...extra}));
// FE-19: the camera is allowed only for this same site (barcode reader in Nueva venta).
export const PERMISSIONS_POLICY='camera=(self), microphone=(), geolocation=(), payment=(), usb=()';
const securityHeaders=res=>{res.setHeader('Permissions-Policy',PERMISSIONS_POLICY);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');};
export const CONTENT_TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
// Hashed build files (/assets/*) never change; HTML entry points, /sw.js and the other
// static files revalidate. API responses keep the no-store default of securityHeaders.
export const staticCacheControl=path=>path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache';
export const deployedVersion=(env=process.env)=>env.RENDER_GIT_COMMIT||env.SCORTA_VERSION||'dev';
const MAINTENANCE_HTML='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCORTA en mantenimiento</title><style>body{font-family:system-ui,sans-serif;background:#f6f7f9;color:#1d2433;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.4rem}</style></head><body><main><h1>SCORTA está en mantenimiento</h1><p>Estamos realizando una tarea programada. Vuelve a intentarlo en unos minutos.</p></main></body></html>';
// BE-01: SCORTA_MAINTENANCE=1 starts without opening any database so the operator can
// run `node platform-backup.mjs restore ... --offline` from Render Shell.
export function createMaintenanceServer({version=deployedVersion(),startedAt=new Date().toISOString()}={}){
 return createServer((req,res)=>{
  securityHeaders(res);res.setHeader('Retry-After','300');
  const path=String(req.url||'').split('?')[0];
  // 200 so Render does not mark the deploy as failed; the body reports maintenance.
  if(path==='/healthz'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});return res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:false,maintenance:true,version,startedAt}));}
  if(path.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'SCORTA está en mantenimiento. Intenta de nuevo en unos minutos.',code:'MAINTENANCE'}));}
  res.writeHead(503,{'Content-Type':'text/html; charset=utf-8',"Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'"});res.end(req.method==='HEAD'?undefined:MAINTENANCE_HTML);
 });
}
// BE-11: rolling p95 over the last `size` API latencies.
export function latencyWindow(size=500){const values=[];return {add(ms){values.push(ms);if(values.length>size)values.shift();},p95(){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*0.95)-1)];}};}
export function diskUsedPct(directory){try{if(!statfsSync)return null;const s=statfsSync(directory);return s.blocks?Math.round((s.blocks-s.bfree)/s.blocks*1000)/10:null;}catch{return null;}}
const listen=(server)=>server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('SCORTA listo en http://localhost:'+server.address().port));
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.env.SCORTA_MAINTENANCE==='1'){
 opsLog('warn','maintenance-mode',{message:'SCORTA_MAINTENANCE=1: bases cerradas; /api responde 503'});
 const server=createMaintenanceServer();for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close(()=>process.exit(0));server.closeAllConnections?.();setTimeout(()=>process.exit(0),3000).unref();});listen(server);
}else if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dataDir=resolve(process.env.DATA_DIR||resolve(root,'data')),startedAt=new Date().toISOString(),version=deployedVersion();
 const store=openStore(resolve(dataDir,'motoshop.sqlite'));
 const platformFile=resolve(dataDir,'platform.sqlite');
 let lastBackup={at:null,ok:null};
 if(existsSync(platformFile)){
  // SEG-04: the owner password only seeds a brand-new platform database.
  if(process.env.SCORTA_OWNER_PASSWORD)opsLog('warn','owner-password-unused',{message:'borra SCORTA_OWNER_PASSWORD de Render; ya no se usa'});
  // BE-02: consistent copy before opening the database on every start.
  try{const file=await startupBackup(platformFile,resolve(dataDir,'backups'));lastBackup={at:new Date().toISOString(),ok:true,kind:'startup'};opsLog('info','startup-backup',{file});}
  catch(error){lastBackup={at:new Date().toISOString(),ok:false,kind:'startup'};opsLog('error','startup-backup-failed',{error:String(error?.message||error)});}
 }
 const platformConfigured=!!process.env.SCORTA_OWNER_PASSWORD||existsSync(platformFile);
 const platformStore=platformConfigured?await openPlatformStore(platformFile,{owner:process.env.SCORTA_OWNER_PASSWORD?{company:process.env.SCORTA_OWNER_COMPANY||'Fragola',username:process.env.SCORTA_OWNER_USER||'Steven',name:process.env.SCORTA_OWNER_NAME||'Steven',email:process.env.SCORTA_OWNER_EMAIL||'',password:process.env.SCORTA_OWNER_PASSWORD}:undefined,ownerContact:process.env.SCORTA_OWNER_CONTACT||'',legacyState:store.read(),withTestCompany:testCompanyEnabled()}):null;
 const requireTerms=process.env.NODE_ENV==='production'||process.env.SCORTA_REQUIRE_TERMS==='1';
 // Propietario: verificación en dos pasos obligatoria en producción (SCORTA_REQUIRE_OWNER_2FA=0 la vuelve opcional; =1 la exige fuera de producción).
 const requireOwnerTwoFactor=process.env.SCORTA_REQUIRE_OWNER_2FA==='1'||process.env.NODE_ENV==='production'&&process.env.SCORTA_REQUIRE_OWNER_2FA!=='0';
 // SEG-13: correo transaccional (Resend o webhook). Sin configuración queda desactivado.
 let mailer;try{mailer=createMailer({log:({level,event,...rest})=>opsLog(level,event,rest)});}catch(error){opsLog('error','mail-config-invalid',{error:String(error?.message||error)});mailer=createMailer({env:{}});}
 if(mailer.enabled&&!process.env.SCORTA_PUBLIC_URL)opsLog('warn','mail-without-public-url',{message:'Define SCORTA_PUBLIC_URL: sin ella no se envían enlaces de recuperación'});
 opsLog('info','mail-config',{provider:mailer.provider,enabled:mailer.enabled&&!!process.env.SCORTA_PUBLIC_URL});
 const handlePlatform=createPlatformHandler({mailer,store:platformStore,production:process.env.NODE_ENV==='production',publicUrl:process.env.SCORTA_PUBLIC_URL,clientIpHeader:process.env.SCORTA_CLIENT_IP_HEADER,trustedProxyHops:Number(process.env.SCORTA_TRUSTED_PROXY_HOPS)||1,requireTerms,requireDataConsent:requireTerms,requireOwnerTwoFactor});
 const offsite=startOffsiteBackup(platformStore,{onResult:result=>{lastBackup={at:result.at,ok:result.ok,kind:'offsite'};}});
 const latency=latencyWindow(500),logIpHeaders=process.env.SCORTA_LOG_IP_HEADERS==='1';let warned=0;
 const health=()=>{
  let ok=false,db=null;
  try{ok=platformStore?platformStore.health():!!store.read();db=platformStore?platformStore.stats():{sizeBytes:statSync(resolve(dataDir,'motoshop.sqlite')).size,stateBytes:null};}catch(error){opsLog('error','healthz-failed',{error:String(error?.stack||error)});}
  const usedPct=diskUsedPct(dataDir),warning=(usedPct??0)>80||(db?.stateBytes??0)>20*1024*1024;
  if(warning&&Date.now()-warned>3600000){warned=Date.now();opsLog('warn','capacity-warning',{diskUsedPct:usedPct,stateBytes:db?.stateBytes??null,message:'Disco por encima del 80 % o estado mayor a 20 MB'});}
  if(!warning)warned=0;
  return {ok,version,startedAt,db,disk:{usedPct},latencyP95Ms:latency.p95(),lastBackup,warning};
 };
 const bootstrap=process.env.SCORTA_ADMIN_PASSWORD;
 if(!store.listUsers().length&&bootstrap){store.addUser(process.env.SCORTA_ADMIN_USER||'admin',bootstrap,'admin')}
 if(process.env.NODE_ENV==='production'&&!platformStore&&!store.listUsers().length)throw Error('Configura SCORTA_ADMIN_PASSWORD con 8 o más caracteres, número, mayúscula, minúscula y símbolo para crear el primer administrador');
 const production=process.env.NODE_ENV==='production';
 const auth=createAuth({store,production,allowLocal:!production});
 // One JSON line per API request (stdout is collected by Render). Receipt tokens are redacted.
 const logRequest=(req,res,started)=>{const path=String(req.url||'').split('?')[0].replace(/\/receipt\/[A-Za-z0-9_-]{43}/,'/receipt/[token]');if(!path.startsWith('/api/')&&path!=='/healthz'&&res.statusCode<400)return;const ms=Math.round(performance.now()-started);if(path.startsWith('/api/'))latency.add(ms);const line=JSON.stringify({level:res.statusCode>=500?'error':'info',at:new Date().toISOString(),method:req.method,path,status:res.statusCode,ms});(res.statusCode>=500?console.error:console.log)(line);};
 const server=createServer(async(req,res)=>{
 const started=performance.now();res.once('finish',()=>logRequest(req,res,started));
 if(logIpHeaders&&String(req.url||'').startsWith('/api/'))console.log(JSON.stringify(ipHeaderDiagnostics(req)));
 securityHeaders(res);
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(path==='/healthz'&&(req.method==='GET'||req.method==='HEAD')){const full=health(),body=healthDetailAllowed(req)?full:{ok:full.ok,version:full.version,startedAt:full.startedAt,warning:full.warning};res.writeHead(full.ok?200:503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:JSON.stringify(body));}
 if(await handlePlatform(req,res))return;
 if(platformStore&&path.startsWith('/api/')){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'Usa el acceso de empresa de SCORTA',code:'PLATFORM_REQUIRED'}));}
 if(path.startsWith('/api/')){
 const actor=await auth.handle(req,res);if(!actor)return;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method==='GET'&&path==='/api/session')return res.end(JSON.stringify(actor));
 if(req.method==='GET'&&path==='/api/users'){if(actor.role!=='admin')throw Object.assign(Error('Acceso restringido'),{status:403});return res.end(JSON.stringify(store.listUsers()))}
 if(req.method==='GET'&&path==='/api/productos')return res.end(JSON.stringify(consultarProductos(store.read(),url.searchParams)));
 if(req.method==='GET'&&path==='/api/movimientos')return res.end(JSON.stringify(consultarMovimientos(store.read(),url.searchParams)));
 const productMatch=path.match(/^\/api\/productos\/([^/]+)(\/movimientos)?$/);
 if(req.method==='GET'&&productMatch){const state=store.read(),id=decodeURIComponent(productMatch[1]),product=state.prods.find(p=>p.id===id);if(!product)throw Object.assign(Error('Producto inexistente'),{status:404});return res.end(JSON.stringify(productMatch[2]?consultarMovimientos(state,url.searchParams,id):product));}
 if(req.method==='GET'&&path==='/api/state')return res.end(JSON.stringify(store.read()));
 if(req.method==='GET'&&path==='/api/backup/full'){if(actor.role!=='admin')throw Object.assign(Error('Acceso restringido'),{status:403});const data=await store.fullBackup();res.setHeader('Content-Type','application/vnd.sqlite3');res.setHeader('Content-Disposition','attachment; filename="scorta-respaldo-'+new Date().toISOString().slice(0,10)+'.sqlite"');return res.end(data)}
 if(req.method==='GET'&&path==='/api/backup'){if(actor.role!=='admin')throw Object.assign(Error('Acceso restringido'),{status:403});res.setHeader('Content-Disposition','attachment; filename="motoshop-respaldo.json"');return res.end(JSON.stringify(store.read(),null,2))}
 if(req.method==='POST'&&['/api/change','/api/users'].includes(path)){
 let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1000000)throw Error('Solicitud demasiado grande')};let payload;try{payload=JSON.parse(body)}catch{throw Error('Datos inválidos: envía un objeto JSON')}if(!payload||Array.isArray(payload)||typeof payload!=='object')throw Error('Datos inválidos: envía un objeto JSON');if(path==='/api/users'){if(actor.role!=='admin')throw Object.assign(Error('Acceso restringido'),{status:403});store.addUser(payload.username,payload.password,payload.role);return res.end(JSON.stringify(store.listUsers()))}if(actor.role!=='admin'&&!['venta','servicio','estado'].includes(payload.kind))throw Object.assign(Error('No tienes permiso para esta operación'),{status:403});return res.end(JSON.stringify(store.change(payload,actor.username)));
 }res.statusCode=404;return res.end('{}');}
 if(req.method!=='GET'){res.statusCode=405;return res.end()}
 const spa=/^\/catalogo\/[^/]+\/?$/.test(path)||path==='/'||path==='/recuperar'||/^\/c\/[^/]+\/?$/.test(path)||/^\/receipt\/[A-Za-z0-9_-]{43}$/.test(path);
 const landing=path==='/inicio'||path==='/inicio/';
 const file=resolve(root,'dist','.'+(spa?'/index.html':landing?'/landing.html':decodeURIComponent(path)));
 if(!file.startsWith(resolve(root,'dist')+'/')&&!file.startsWith(resolve(root,'dist')+'\\'))throw Error('Ruta inválida');
 if(!existsSync(file)){res.statusCode=404;return res.end('No encontrado')}
 let contents=readFileSync(file);
 const catalogPage=path.match(/^\/catalogo\/([^/]+)\/?$/);
 if(catalogPage){let company;try{const result=await platformStore?.request({method:'GET',path:'/api/v2/catalog/'+catalogPage[1]});if(result?.status===200)company=result.body.company;}catch{}contents=catalogHead(contents.toString('utf8'),company);}
 res.setHeader('Content-Type',CONTENT_TYPES[extname(file).toLowerCase()]||'application/octet-stream');res.setHeader('Cache-Control',staticCacheControl(path));
 const encoded=compressStatic(req,res,file,contents,!catalogPage);res.end(encoded);
 }catch(e){const internal=!e?.status&&isProgrammingError(e);if(!e?.status)console.error(JSON.stringify({level:internal?'error':'warn',at:new Date().toISOString(),method:req.method,path:String(req.url||'').split('?')[0],error:String(internal?e?.stack||e:e?.message||e)}));res.statusCode=e?.status||(internal?500:400);res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(internal?{error:'Error interno del servidor. Intenta de nuevo.',code:'INTERNAL_ERROR'}:{error:e?.message}))}
 });server.on('close',()=>{offsite.stop();auth.close();store.close();platformStore?.close()});
 // Graceful stop for redeploys: stop accepting, drop idle keep-alive sockets, then
 // force-close the rest so the databases close and the lock file is removed before
 // the platform's SIGKILL deadline.
 let stopping=false;
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{if(stopping)return;stopping=true;server.close(()=>process.exit(0));server.closeIdleConnections?.();setTimeout(()=>server.closeAllConnections?.(),5000).unref();setTimeout(()=>{try{offsite.stop();auth.close();store.close();platformStore?.close();}catch{}process.exit(0);},10000).unref();});listen(server);
}


