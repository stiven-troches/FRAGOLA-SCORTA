import {catalogHead} from './catalog.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,statSync,statfsSync} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {brotliCompressSync,gzipSync,constants as zlibConstants} from 'node:zlib';
import {timingSafeEqual,createHash} from 'node:crypto';
import {openPlatformStore,createPlatformHandler,ipHeaderDiagnostics} from './platform-server.mjs';
import {testCompanyEnabled} from './test-company.mjs';
import {startupBackup} from './platform-backup.mjs';
import {startOffsiteBackup} from './ops/offsite-backup.mjs';
import {createMailer} from './ops/mailer.mjs';
import {createAlerter,errorBurst,securityAlert,scrub} from './ops/alerts.mjs';
import {createMediaStore,mediaConfig} from './media-store.mjs';
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
// BE-38: the old single-shop mode ("motoshop") is retired. Its database is only read,
// once and read-only, to seed a brand-new platform.sqlite with the previous commercial
// data ("Almacén principal"). No legacy HTTP route or account system remains.
export function readLegacyState(file){
 if(!existsSync(file))return undefined;
 let db;
 try{db=new DatabaseSync(file,{readOnly:true});const row=db.prepare('SELECT data FROM app WHERE id=1').get();return row?JSON.parse(row.data):undefined;}
 catch{return undefined;}
 finally{db?.close();}
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
 const platformFile=resolve(dataDir,'platform.sqlite');
 // OPS-19: last local (startup) and offsite backup, kept apart for the owner panel.
 let lastBackup={at:null,ok:null};const backups={local:null,offsite:null};
 if(existsSync(platformFile)){
  // SEG-04: the owner password only seeds a brand-new platform database.
  if(process.env.SCORTA_OWNER_PASSWORD)opsLog('warn','owner-password-unused',{message:'borra SCORTA_OWNER_PASSWORD de Render; ya no se usa'});
  // BE-02: consistent copy before opening the database on every start.
  try{const file=await startupBackup(platformFile,resolve(dataDir,'backups'));lastBackup={at:new Date().toISOString(),ok:true,kind:'startup'};opsLog('info','startup-backup',{file});}
  catch(error){lastBackup={at:new Date().toISOString(),ok:false,kind:'startup'};opsLog('error','startup-backup-failed',{error:String(error?.message||error)});}
  backups.local={...lastBackup};
 }
 // BE-30: fotos y logos en R2 (SCORTA_MEDIA_S3_*) o, sin esa configuración, en DATA_DIR/media.
 const mediaSettings=mediaConfig();if(mediaSettings.missing.length)opsLog('error','media-s3-incomplete',{missing:mediaSettings.missing,message:'Faltan variables de R2 para imágenes; se usa DATA_DIR/media'});
 const media=createMediaStore({dir:resolve(dataDir,'media'),s3:mediaSettings.s3});opsLog('info','media-config',{backend:media.kind,...(mediaSettings.s3?{bucket:mediaSettings.s3.bucket,prefix:mediaSettings.s3.prefix}:{dir:media.dir})});
 // SEG-13: correo transaccional (Resend o webhook). Sin configuración queda desactivado.
 let mailer;try{mailer=createMailer({log:({level,event,...rest})=>opsLog(level,event,rest)});}catch(error){opsLog('error','mail-config-invalid',{error:String(error?.message||error)});mailer=createMailer({env:{}});}
 if(mailer.enabled&&!process.env.SCORTA_PUBLIC_URL)opsLog('warn','mail-without-public-url',{message:'Define SCORTA_PUBLIC_URL: sin ella no se envían enlaces de recuperación'});
 opsLog('info','mail-config',{provider:mailer.provider,enabled:mailer.enabled&&!!process.env.SCORTA_PUBLIC_URL});
 // BE-11/BE-33/OPS-07: alerts also go by email to SCORTA_OWNER_EMAIL (max one per type per hour).
 const alerter=createAlerter({mailer,to:process.env.SCORTA_OWNER_EMAIL,version,log:({level,event,...rest})=>opsLog(level,event,rest)});
 opsLog('info','alert-mail-config',{enabled:alerter.enabled});
 const onSecurityEvents=events=>{for(const event of events){const alert=securityAlert(event);alerter.notify(alert.type,alert);}};
 const platformExists=existsSync(platformFile),platformConfigured=!!process.env.SCORTA_OWNER_PASSWORD||platformExists;
 if(process.env.NODE_ENV==='production'&&!platformConfigured)throw Error('Configura SCORTA_OWNER_PASSWORD para preparar la plataforma SCORTA');
 const platformStore=platformConfigured?await openPlatformStore(platformFile,{owner:process.env.SCORTA_OWNER_PASSWORD?{company:process.env.SCORTA_OWNER_COMPANY||'Fragola',username:process.env.SCORTA_OWNER_USER||'Steven',name:process.env.SCORTA_OWNER_NAME||'Steven',email:process.env.SCORTA_OWNER_EMAIL||'',password:process.env.SCORTA_OWNER_PASSWORD}:undefined,ownerContact:process.env.SCORTA_OWNER_CONTACT||'',legacyState:platformExists?undefined:readLegacyState(resolve(dataDir,'motoshop.sqlite')),withTestCompany:testCompanyEnabled(),onSecurityEvents,media}):null;
 const requireTerms=process.env.NODE_ENV==='production'||process.env.SCORTA_REQUIRE_TERMS==='1';
 // Propietario: verificación en dos pasos obligatoria en producción (SCORTA_REQUIRE_OWNER_2FA=0 la vuelve opcional; =1 la exige fuera de producción).
 const requireOwnerTwoFactor=process.env.SCORTA_REQUIRE_OWNER_2FA==='1'||process.env.NODE_ENV==='production'&&process.env.SCORTA_REQUIRE_OWNER_2FA!=='0';
 const offsite=startOffsiteBackup(platformStore,{mediaDir:media.kind==='disk'?media.dir:null,onResult:result=>{lastBackup={at:result.at,ok:result.ok,kind:'offsite'};backups.offsite={at:result.at,ok:result.ok};
  if(!result.ok)alerter.notify('offsite-backup-failed',{subject:'Falló el respaldo externo cifrado',lines:['Último intento: '+result.at,'Error: '+scrub(result.error,300),'El respaldo local al arrancar sigue disponible; revisa las variables SCORTA_S3_* y el bucket.']});}});
 const latency=latencyWindow(500),logIpHeaders=process.env.SCORTA_LOG_IP_HEADERS==='1';let warned=0;
 const health=()=>{
  let ok=false,db=null;
  try{ok=!!platformStore?.health();db=platformStore?platformStore.stats():null;}catch(error){opsLog('error','healthz-failed',{error:String(error?.stack||error)});}
  const usedPct=diskUsedPct(dataDir),warning=(usedPct??0)>80||(db?.stateBytes??0)>20*1024*1024;
  if(warning&&Date.now()-warned>3600000){warned=Date.now();opsLog('warn','capacity-warning',{diskUsedPct:usedPct,stateBytes:db?.stateBytes??null,message:'Disco por encima del 80 % o estado mayor a 20 MB'});
   alerter.notify('capacity-warning',{subject:'Capacidad del servidor en alerta',lines:['Disco usado: '+(usedPct==null?'sin dato':usedPct+' %'),'Estado de la plataforma: '+(db?.stateBytes==null?'sin dato':(db.stateBytes/1048576).toFixed(1)+' MB'),'Umbrales: disco 80 % · estado 20 MB']});}
  if(!warning)warned=0;
  return {ok,version,startedAt,db,disk:{usedPct},latencyP95Ms:latency.p95(),lastBackup,warning};
 };
 // OPS-19: read-only server status for the owner panel (same data as the /healthz detail).
 const serverStatus=()=>({...health(),uptimeSeconds:Math.round(process.uptime()),backups:{local:backups.local,offsite:backups.offsite,offsiteEnabled:!!offsite.enabled},alertMail:alerter.enabled});
 const handlePlatform=createPlatformHandler({mailer,store:platformStore,production:process.env.NODE_ENV==='production',publicUrl:process.env.SCORTA_PUBLIC_URL,clientIpHeader:process.env.SCORTA_CLIENT_IP_HEADER,trustedProxyHops:Number(process.env.SCORTA_TRUSTED_PROXY_HOPS)||1,requireTerms,requireDataConsent:requireTerms,requireOwnerTwoFactor,serverStatus,media});
 // Capacity is checked every 15 minutes even if nobody calls /healthz.
 const capacityTimer=setInterval(health,15*60*1000);capacityTimer.unref();
 const production=process.env.NODE_ENV==='production';
 // OPS-07: a burst of 5xx answers (10 in 5 minutes) also emails the owner.
 const burst=errorBurst({threshold:Number(process.env.SCORTA_ALERT_5XX_THRESHOLD)||10,windowMs:5*60*1000});
 // One JSON line per API request (stdout is collected by Render). Receipt tokens are redacted.
 const logRequest=(req,res,started)=>{const path=String(req.url||'').split('?')[0].replace(/\/receipt\/[A-Za-z0-9_-]{43}/,'/receipt/[token]');if(res.statusCode>=500&&burst.record())alerter.notify('http-5xx-burst',{subject:'Ráfaga de errores del servidor',lines:[burst.count()+' respuestas 5xx en los últimos 5 minutos','Última ruta con error: '+req.method+' '+path.replace(/[^\w/.-]/g,'').slice(0,120)]});if(!path.startsWith('/api/')&&path!=='/healthz'&&res.statusCode<400)return;const ms=Math.round(performance.now()-started);if(path.startsWith('/api/'))latency.add(ms);const line=JSON.stringify({level:res.statusCode>=500?'error':'info',at:new Date().toISOString(),method:req.method,path,status:res.statusCode,ms});(res.statusCode>=500?console.error:console.log)(line);};
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
 // BE-38: only /api/v2/* exists; the retired single-shop routes are not served.
 if(path.startsWith('/api/')){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'Usa el acceso de empresa de SCORTA',code:'PLATFORM_REQUIRED'}));}
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
 });server.on('close',()=>{offsite.stop();platformStore?.close()});
 // Graceful stop for redeploys: stop accepting, drop idle keep-alive sockets, then
 // force-close the rest so the databases close and the lock file is removed before
 // the platform's SIGKILL deadline.
 let stopping=false;
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{if(stopping)return;stopping=true;server.close(()=>process.exit(0));server.closeIdleConnections?.();setTimeout(()=>server.closeAllConnections?.(),5000).unref();setTimeout(()=>{try{offsite.stop();platformStore?.close();}catch{}process.exit(0);},10000).unref();});listen(server);
}


