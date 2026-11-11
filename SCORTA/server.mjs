import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {timingSafeEqual,createHash,scryptSync,randomBytes} from 'node:crypto';
import {createAuth} from './auth.mjs';
import {createFullBackup} from './backup.mjs';
import {consultarProductos, consultarMovimientos} from './consultas.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export function openStore(file){
 mkdirSync(dirname(file),{recursive:true});const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, role TEXT NOT NULL, salt TEXT NOT NULL, digest TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)');
 const empty={revision:0,prods:[],compras:[],ventas:[],servs:[],movimientos:[]};
 db.prepare('INSERT OR IGNORE INTO app VALUES(1,?)').run(JSON.stringify(empty));
 const read=()=>JSON.parse(db.prepare('SELECT data FROM app WHERE id=1').get().data);
 const num=(v,integer=false)=>{const n=Number(v);if(v===''||v==null||!Number.isFinite(n)||n<0||n>1e12||(integer&&!Number.isSafeInteger(n)))throw Error('Valor numérico inválido');return n};
 const text=(v,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Texto obligatorio o demasiado largo');return v.trim()};
 function addUser(username,password,role){if(!listUsers().length&&role!=='admin')throw Error('La primera cuenta debe ser administradora para poder gestionar el almacén. Selecciona Administrador.');if(!/^[a-zA-Z0-9._-]{3,60}$/.test(username)||!['admin','operador'].includes(role)||typeof password!=='string'||password.length<16||password.length>200)throw Error('Usuario, rol o contraseña inválidos (mínimo 16 caracteres)');const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,64).toString('hex');db.prepare('INSERT INTO users(username,role,salt,digest) VALUES(?,?,?,?)').run(username,role,salt,digest)}
 function verifyUser(username,password){const u=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);if(!u)return null;const actual=scryptSync(password,u.salt,64), expected=Buffer.from(u.digest,'hex');return timingSafeEqual(actual,expected)?{username:u.username,role:u.role}:null}
 function setUserPassword(username,password){if(typeof password!=='string'||password.length<16||password.length>200)throw Error('La contraseña debe tener entre 16 y 200 caracteres');const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,64).toString('hex');const result=db.prepare('UPDATE users SET salt=?, digest=? WHERE username=? AND active=1').run(salt,digest,username);if(!result.changes)throw Error('Usuario inexistente');}
 function listUsers(){return db.prepare('SELECT username,role,active FROM users ORDER BY username').all()}
 function change(a,actor='local'){db.exec('BEGIN IMMEDIATE');try{const s=read(); const fingerprint=createHash('sha256').update(JSON.stringify({kind:a.kind,form:a.form,items:a.items,id:a.id})).digest('hex'); if(a.requestId){const prev=db.prepare('SELECT fingerprint FROM requests WHERE id=?').get(a.requestId);if(prev){if(prev.fingerprint!==fingerprint)throw Error('El identificador de operación ya fue usado con otros datos');db.exec('COMMIT');return s;}} if(a.revision!==s.revision)throw Error('Otro usuario modificó los datos. Recarga y vuelve a intentar.');const id=Date.now().toString()+Math.random().toString(36).slice(2,8);const f=a.form||{};
 const movement=(p,before,tipo,extra={})=>s.movimientos.unshift({id:id+'-'+p.id+'-'+s.movimientos.length,fecha:new Date().toISOString(),producto_id:p.id,nombre:p.nombre,cantidad:p.stock-before,tipo,usuario:actor,stock_antes:before,stock_despues:p.stock,tipo_documento:null,...extra});
 if(a.kind==='producto'){
 const old=s.prods.find(p=>p.id===f.id);const p={id:old?.id||id,nombre:text(f.nombre),categoria:text(f.categoria||'General'),referencia:String(f.referencia||'').trim().slice(0,100),marca:String(f.marca||'').trim().slice(0,100),modelo:String(f.modelo||'').trim().slice(0,100),compatibilidad:String(f.compatibilidad||'').trim().slice(0,300),codigo_barras:String(f.codigo_barras||'').trim().slice(0,100),precio_compra:num(f.precio_compra??0),precio_venta:num(f.precio_venta),stock:old?old.stock:num(f.stock??0,true),stock_minimo:num(f.stock_minimo??5,true)};
 if(s.prods.some(x=>x.id!==p.id&&x.nombre.toLowerCase()===p.nombre.toLowerCase()))throw Error('Ya existe un producto con ese nombre');
 if(old)s.prods[s.prods.indexOf(old)]=p;else{s.prods.push(p);movement(p,0,'apertura');}
  }else if(a.kind==='ajuste'){
 const p=s.prods.find(x=>x.id===a.id);if(!p)throw Error('Producto inexistente');const stock=num(f.stock,true),motivo=text(f.motivo,500);const before=p.stock;p.stock=stock;movement(p,before,'ajuste',{motivo});
 }else if(a.kind==='eliminar'){
 const p=s.prods.find(x=>x.id===a.id);if(!p)throw Error('Producto inexistente');if(p.stock!==0)throw Error('Solo se pueden retirar productos sin existencias');if([...s.compras,...s.ventas,...s.servs].some(doc=>doc.detalles.some(d=>d.producto_id===p.id)))throw Error('El producto tiene historial y no puede retirarse');s.prods=s.prods.filter(x=>x.id!==a.id);
 }else if(a.kind==='estado'){
 const p=s.servs.find(x=>x.id===a.id),states=['pendiente','en_proceso','completado','entregado'];if(!p||p.anulada||!states.includes(p.estado)||p.estado==='entregado')throw Error('Estado inválido');p.estado=states[states.indexOf(p.estado)+1];if(p.estado==='entregado')p.fecha_entrega=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 }else if(a.kind==='importar'){
 if(!Array.isArray(a.items)||!a.items.length||a.items.length>1000)throw Error('Importa de 1 a 1000 productos');
 for(const [index,row] of a.items.entries()){const nombre=text(row.nombre),referencia=String(row.referencia||'').trim();if(s.prods.some(p=>p.nombre.toLowerCase()===nombre.toLowerCase()||(referencia&&p.referencia?.toLowerCase()===referencia.toLowerCase())))throw Error('Producto o referencia duplicado en fila '+(index+2));const p={id:id+'-'+index,nombre,categoria:String(row.categoria||'General').trim(),referencia,marca:String(row.marca||'').trim(),modelo:String(row.modelo||'').trim(),compatibilidad:String(row.compatibilidad||'').trim(),codigo_barras:String(row.codigo_barras||'').trim(),precio_compra:num(row.precio_compra||0),precio_venta:num(row.precio_venta),stock:num(row.stock||0,true),stock_minimo:num(row.stock_minimo||0,true)};s.prods.push(p);movement(p,0,'apertura');}
 }else if(a.kind==='reversion'){
 const maps={compra:'compras',venta:'ventas',servicio:'servs'};const collection=maps[f.tipo];if(!collection)throw Error('Tipo inválido');const rec=s[collection].find(x=>x.id===a.id);if(!rec||rec.anulada)throw Error('Documento inexistente o anulado');const motivo=text(f.motivo,500);const partial=f.parcial===true;
 if(partial&&f.tipo!=='venta')throw Error('Solo las ventas admiten devolución parcial');
 if(partial&&(!Array.isArray(a.items)||a.items.length===0))throw Error('Selecciona productos a devolver');
 const selected=partial?a.items:rec.detalles.map((d,index)=>({index,cantidad:d.cantidad-(d.devuelto||0)})).filter(d=>d.cantidad>0);
 const seen=new Set();for(const line of selected){const index=num(line.index,true),q=num(line.cantidad,true);if(seen.has(index)||q<1)throw Error('Cantidad o línea inválida');seen.add(index);const d=rec.detalles[index];if(!d||q>d.cantidad-(d.devuelto||0))throw Error('Cantidad superior a la pendiente');const p=s.prods.find(x=>x.id===d.producto_id);if(!p)throw Error('Producto retirado: no se puede revertir');const delta=f.tipo==='compra'?-q:q;if(p.stock+delta<0)throw Error('Stock insuficiente para revertir compra: '+p.nombre);const before=p.stock;p.stock+=delta;d.devuelto=(d.devuelto||0)+q;movement(p,before,partial?'devolución':'anulación',{motivo,documento:rec.id,tipo_documento:f.tipo});}
 rec.reversiones??=[];rec.reversiones.push({id,fecha:new Date().toISOString(),usuario:actor,motivo,parcial:partial,detalles:selected});if(!partial){rec.anulada=true;rec.estado_anterior=rec.estado;if(f.tipo==='servicio')rec.estado='anulado';}
 }else if(['compra','venta','servicio'].includes(a.kind)){
 const date=text(f.fecha,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date)throw Error('Fecha inválida');
 if(!Array.isArray(a.items)||(!a.items.length&&a.kind!=='servicio'))throw Error('Agrega productos');
 const quantities=new Map();const detalles=a.items.map(it=>{const p=s.prods.find(x=>x.id===it.producto_id);if(!p)throw Error('Producto inexistente');const cantidad=num(it.cantidad,true);if(cantidad<1)throw Error('Cantidad inválida');quantities.set(p.id,(quantities.get(p.id)||0)+cantidad);return {producto_id:p.id,nombre:p.nombre,cantidad,precio_unitario:num(it.precio_unitario),costo_unitario:p.precio_compra}});
 for(const [pid,qty] of quantities){const p=s.prods.find(x=>x.id===pid);if(a.kind!=='compra'&&p.stock<qty)throw Error('Stock insuficiente para '+p.nombre+': quedan '+p.stock+' unidades y solicitaste '+qty);const before=p.stock;p.stock+=(a.kind==='compra'?qty:-qty);if(a.kind==='compra'){const lines=detalles.filter(x=>x.producto_id===pid);p.precio_compra=lines.reduce((t,x)=>t+x.cantidad*x.precio_unitario,0)/qty;}movement(p,before,a.kind,{documento:id,tipo_documento:a.kind});}
 const record={id,fecha:date,usuario:actor,detalles,total:detalles.reduce((n,x)=>n+x.cantidad*x.precio_unitario,0)};
 if(a.kind==='compra'){record.proveedor=text(f.proveedor||'Sin especificar');s.compras.unshift(record)}
 if(a.kind==='venta'){record.cliente=text(f.cliente||'Cliente general');s.ventas.unshift(record)}
 if(a.kind==='servicio'){Object.assign(record,{placa:text(f.placa).toUpperCase(),marca_moto:text(f.marca_moto||'Sin especificar'),descripcion_trabajo:text(f.descripcion_trabajo,3000),costo_mano_obra:num(f.costo_mano_obra??0),estado:'pendiente'});record.total+=record.costo_mano_obra;s.servs.unshift(record)}
 }else throw Error('Operación desconocida');
 s.auditoria??=[];s.auditoria.unshift({id,fecha:new Date().toISOString(),usuario:actor,accion:a.kind,documento:a.id||id});s.revision++;if(a.requestId)db.prepare('INSERT INTO requests VALUES(?,?)').run(a.requestId,fingerprint);db.prepare('UPDATE app SET data=? WHERE id=1').run(JSON.stringify(s));db.exec('COMMIT');return s;
 }catch(e){db.exec('ROLLBACK');throw e}}
 return {read,change,addUser,verifyUser,setUserPassword,listUsers,fullBackup:()=>createFullBackup(db),close:()=>db.close()};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const store=openStore(resolve(process.env.DATA_DIR||resolve(root,'data'),'motoshop.sqlite'));
 const bootstrap=process.env.SCORTA_ADMIN_PASSWORD;
 if(!store.listUsers().length&&bootstrap){store.addUser(process.env.SCORTA_ADMIN_USER||'admin',bootstrap,'admin')}
 if(process.env.NODE_ENV==='production'&&!store.listUsers().length)throw Error('Configura SCORTA_ADMIN_PASSWORD con al menos 16 caracteres para crear el primer administrador');
 const production=process.env.NODE_ENV==='production';
 const auth=createAuth({store,production,allowLocal:!production});
 const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
 try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
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
 const file=resolve(root,'dist','.'+(path==='/'?'/index.html':decodeURIComponent(path)));
 if(!file.startsWith(resolve(root,'dist')+'/')&&!file.startsWith(resolve(root,'dist')+'\\'))throw Error('Ruta inválida');
 if(!existsSync(file)){res.statusCode=404;return res.end('No encontrado')}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream'));res.end(readFileSync(file));
 }catch(e){res.statusCode=e.status||400;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:e.message}))}
 });server.on('close',()=>{auth.close();store.close()});server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('SCORTA listo en http://localhost:'+(process.env.PORT||3000)));
}


