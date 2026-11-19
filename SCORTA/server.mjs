import {passwordPolicyError} from './password-policy.mjs';
import {DatabaseSync} from 'node:sqlite';
import {aplicarCambio, estadoVacio} from './inventory.mjs';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {timingSafeEqual,createHash,scryptSync,randomBytes} from 'node:crypto';
import {createAuth} from './auth.mjs';
import {createFullBackup} from './backup.mjs';
import {consultarProductos, consultarMovimientos} from './consultas.mjs';
import {openPlatformStore,createPlatformHandler} from './platform-server.mjs';
const root=dirname(fileURLToPath(import.meta.url));
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
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const store=openStore(resolve(process.env.DATA_DIR||resolve(root,'data'),'motoshop.sqlite'));
 const platformFile=resolve(process.env.DATA_DIR||resolve(root,'data'),'platform.sqlite');
 const platformConfigured=!!process.env.SCORTA_OWNER_PASSWORD||existsSync(platformFile);
 const platformStore=platformConfigured?await openPlatformStore(platformFile,{owner:process.env.SCORTA_OWNER_PASSWORD?{company:process.env.SCORTA_OWNER_COMPANY||'Fragola',username:process.env.SCORTA_OWNER_USER||'Steven',name:process.env.SCORTA_OWNER_NAME||'Steven',email:process.env.SCORTA_OWNER_EMAIL||'',password:process.env.SCORTA_OWNER_PASSWORD}:undefined,ownerContact:process.env.SCORTA_OWNER_CONTACT||'',legacyState:store.read()}):null;
 const handlePlatform=createPlatformHandler({store:platformStore,production:process.env.NODE_ENV==='production',publicUrl:process.env.SCORTA_PUBLIC_URL});
 const bootstrap=process.env.SCORTA_ADMIN_PASSWORD;
 if(!store.listUsers().length&&bootstrap){store.addUser(process.env.SCORTA_ADMIN_USER||'admin',bootstrap,'admin')}
 if(process.env.NODE_ENV==='production'&&!platformStore&&!store.listUsers().length)throw Error('Configura SCORTA_ADMIN_PASSWORD con 8 o más caracteres, número, mayúscula, minúscula y símbolo para crear el primer administrador');
 const production=process.env.NODE_ENV==='production';
 const auth=createAuth({store,production,allowLocal:!production});
 const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
 try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
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
 const spa=path==='/'||/^\/c\/[^/]+\/?$/.test(path)||/^\/receipt\/[A-Za-z0-9_-]{43}$/.test(path);
 const file=resolve(root,'dist','.'+(spa?'/index.html':decodeURIComponent(path)));
 if(!file.startsWith(resolve(root,'dist')+'/')&&!file.startsWith(resolve(root,'dist')+'\\'))throw Error('Ruta inválida');
 if(!existsSync(file)){res.statusCode=404;return res.end('No encontrado')}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream'));res.end(readFileSync(file));
 }catch(e){res.statusCode=e.status||400;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:e.message}))}
 });server.on('close',()=>{auth.close();store.close();platformStore?.close()});for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(()=>process.exit(0)));server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('SCORTA listo en http://localhost:'+(process.env.PORT||3000)));
}


