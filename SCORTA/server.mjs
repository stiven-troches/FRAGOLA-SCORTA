import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {timingSafeEqual,createHash,scryptSync,randomBytes} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
export function openStore(file){
 mkdirSync(dirname(file),{recursive:true});const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, role TEXT NOT NULL, salt TEXT NOT NULL, digest TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)');
 const empty={revision:0,prods:[],compras:[],ventas:[],servs:[],movimientos:[]};
 db.prepare('INSERT OR IGNORE INTO app VALUES(1,?)').run(JSON.stringify(empty));
 const read=()=>JSON.parse(db.prepare('SELECT data FROM app WHERE id=1').get().data);
 const num=(v,integer=false)=>{const n=Number(v);if(v===''||v==null||!Number.isFinite(n)||n<0||n>1e12||(integer&&!Number.isSafeInteger(n)))throw Error('Valor numérico inválido');return n};
 const text=(v,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Texto obligatorio o demasiado largo');return v.trim()};
 function addUser(username,password,role){if(!/^[a-zA-Z0-9._-]{3,60}$/.test(username)||!['admin','operador'].includes(role)||typeof password!=='string'||password.length<16||password.length>200)throw Error('Usuario, rol o contraseña inválidos (mínimo 16 caracteres)');const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,64).toString('hex');db.prepare('INSERT INTO users(username,role,salt,digest) VALUES(?,?,?,?)').run(username,role,salt,digest)}
 function verifyUser(username,password){const u=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);if(!u)return null;const actual=scryptSync(password,u.salt,64), expected=Buffer.from(u.digest,'hex');return timingSafeEqual(actual,expected)?{username:u.username,role:u.role}:null}
 function listUsers(){return db.prepare('SELECT username,role,active FROM users ORDER BY username').all()}
 function change(a,actor='local'){db.exec('BEGIN IMMEDIATE');try{const s=read(); const fingerprint=createHash('sha256').update(JSON.stringify({kind:a.kind,form:a.form,items:a.items,id:a.id})).digest('hex'); if(a.requestId){const prev=db.prepare('SELECT fingerprint FROM requests WHERE id=?').get(a.requestId);if(prev){if(prev.fingerprint!==fingerprint)throw Error('El identificador de operación ya fue usado con otros datos');db.exec('COMMIT');return s;}} if(a.revision!==s.revision)throw Error('Otro usuario modificó los datos. Recarga y vuelve a intentar.');const id=Date.now().toString()+Math.random().toString(36).slice(2,8);const f=a.form||{};
 if(a.kind==='producto'){
 const old=s.prods.find(p=>p.id===f.id);const p={id:old?.id||id,nombre:text(f.nombre),categoria:text(f.categoria||'General'),referencia:String(f.referencia||'').trim().slice(0,100),marca:String(f.marca||'').trim().slice(0,100),modelo:String(f.modelo||'').trim().slice(0,100),compatibilidad:String(f.compatibilidad||'').trim().slice(0,300),codigo_barras:String(f.codigo_barras||'').trim().slice(0,100),precio_compra:num(f.precio_compra??0),precio_venta:num(f.precio_venta),stock:old?old.stock:num(f.stock??0,true),stock_minimo:num(f.stock_minimo??5,true)};
 if(s.prods.some(x=>x.id!==p.id&&x.nombre.toLowerCase()===p.nombre.toLowerCase()))throw Error('Ya existe un producto con ese nombre');
 if(old)s.prods[s.prods.indexOf(old)]=p;else{s.prods.push(p);s.movimientos.unshift({id,fecha:new Date().toISOString(),producto_id:p.id,nombre:p.nombre,cantidad:p.stock,tipo:'apertura'});}
  }else if(a.kind==='ajuste'){
 const p=s.prods.find(x=>x.id===a.id);if(!p)throw Error('Producto inexistente');const stock=num(f.stock,true),motivo=text(f.motivo,500);s.movimientos.unshift({id,fecha:new Date().toISOString(),producto_id:p.id,nombre:p.nombre,cantidad:stock-p.stock,tipo:'ajuste',motivo});p.stock=stock;
 }else if(a.kind==='eliminar'){
 const p=s.prods.find(x=>x.id===a.id);if(!p)throw Error('Producto inexistente');if(p.stock!==0)throw Error('Solo se pueden retirar productos sin existencias');if([...s.compras,...s.ventas,...s.servs].some(doc=>doc.detalles.some(d=>d.producto_id===p.id)))throw Error('El producto tiene historial y no puede retirarse');s.prods=s.prods.filter(x=>x.id!==a.id);
 }else if(a.kind==='estado'){
 const p=s.servs.find(x=>x.id===a.id),states=['pendiente','en_proceso','completado','entregado'];if(!p||p.estado==='entregado')throw Error('Estado inválido');p.estado=states[states.indexOf(p.estado)+1];if(p.estado==='entregado')p.fecha_entrega=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 }else if(a.kind==='importar'){
 if(!Array.isArray(a.items)||!a.items.length||a.items.length>1000)throw Error('Importa de 1 a 1000 productos');
 for(const [index,row] of a.items.entries()){const nombre=text(row.nombre),referencia=String(row.referencia||'').trim();if(s.prods.some(p=>p.nombre.toLowerCase()===nombre.toLowerCase()||(referencia&&p.referencia?.toLowerCase()===referencia.toLowerCase())))throw Error('Producto o referencia duplicado en fila '+(index+2));const p={id:id+'-'+index,nombre,categoria:String(row.categoria||'General').trim(),referencia,marca:String(row.marca||'').trim(),modelo:String(row.modelo||'').trim(),compatibilidad:String(row.compatibilidad||'').trim(),codigo_barras:String(row.codigo_barras||'').trim(),precio_compra:num(row.precio_compra||0),precio_venta:num(row.precio_venta),stock:num(row.stock||0,true),stock_minimo:num(row.stock_minimo||0,true)};s.prods.push(p);s.movimientos.unshift({id:p.id,fecha:new Date().toISOString(),producto_id:p.id,nombre:p.nombre,cantidad:p.stock,tipo:'apertura'});}
 }else if(a.kind==='reversion'){
 const maps={compra:'compras',venta:'ventas',servicio:'servs'};const collection=maps[f.tipo];if(!collection)throw Error('Tipo inválido');const rec=s[collection].find(x=>x.id===a.id);if(!rec||rec.anulada)throw Error('Documento inexistente o anulado');const motivo=text(f.motivo,500);const partial=f.parcial===true;
 if(partial&&f.tipo!=='venta')throw Error('Solo las ventas admiten devolución parcial');
 if(partial&&(!Array.isArray(a.items)||a.items.length===0))throw Error('Selecciona productos a devolver');
 const selected=partial?a.items:rec.detalles.map((d,index)=>({index,cantidad:d.cantidad-(d.devuelto||0)})).filter(d=>d.cantidad>0);
 const seen=new Set();for(const line of selected){const index=num(line.index,true),q=num(line.cantidad,true);if(seen.has(index)||q<1)throw Error('Cantidad o línea inválida');seen.add(index);const d=rec.detalles[index];if(!d||q>d.cantidad-(d.devuelto||0))throw Error('Cantidad superior a la pendiente');const p=s.prods.find(x=>x.id===d.producto_id);if(!p)throw Error('Producto retirado: no se puede revertir');const delta=f.tipo==='compra'?-q:q;if(p.stock+delta<0)throw Error('Stock insuficiente para revertir compra: '+p.nombre);p.stock+=delta;d.devuelto=(d.devuelto||0)+q;s.movimientos.unshift({id:id+'-'+index,fecha:new Date().toISOString(),producto_id:p.id,nombre:p.nombre,cantidad:delta,tipo:partial?'devolución':'anulación',motivo,documento:rec.id});}
 rec.reversiones??=[];rec.reversiones.push({id,fecha:new Date().toISOString(),motivo,parcial:partial,detalles:selected});if(!partial){rec.anulada=true;rec.estado_anterior=rec.estado;if(f.tipo==='servicio')rec.estado='anulado';}
 }else if(['compra','venta','servicio'].includes(a.kind)){
 const date=text(f.fecha,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date)throw Error('Fecha inválida');
 if(!Array.isArray(a.items)||(!a.items.length&&a.kind!=='servicio'))throw Error('Agrega productos');
 const quantities=new Map();const detalles=a.items.map(it=>{const p=s.prods.find(x=>x.id===it.producto_id);if(!p)throw Error('Producto inexistente');const cantidad=num(it.cantidad,true);if(cantidad<1)throw Error('Cantidad inválida');quantities.set(p.id,(quantities.get(p.id)||0)+cantidad);return {producto_id:p.id,nombre:p.nombre,cantidad,precio_unitario:num(it.precio_unitario),costo_unitario:p.precio_compra}});
 for(const [pid,qty] of quantities){const p=s.prods.find(x=>x.id===pid);if(a.kind!=='compra'&&p.stock<qty)throw Error('Stock insuficiente: '+p.nombre);p.stock+=(a.kind==='compra'?qty:-qty);if(a.kind==='compra'){const lines=detalles.filter(x=>x.producto_id===pid);p.precio_compra=lines.reduce((t,x)=>t+x.cantidad*x.precio_unitario,0)/qty;}s.movimientos.unshift({id:id+pid,fecha:new Date().toISOString(),producto_id:pid,nombre:p.nombre,cantidad:a.kind==='compra'?qty:-qty,tipo:a.kind,documento:id});}
 const record={id,fecha:date,detalles,total:detalles.reduce((n,x)=>n+x.cantidad*x.precio_unitario,0)};
 if(a.kind==='compra'){record.proveedor=text(f.proveedor||'Sin especificar');s.compras.unshift(record)}
 if(a.kind==='venta'){record.cliente=text(f.cliente||'Cliente general');s.ventas.unshift(record)}
 if(a.kind==='servicio'){Object.assign(record,{placa:text(f.placa).toUpperCase(),marca_moto:text(f.marca_moto||'Sin especificar'),descripcion_trabajo:text(f.descripcion_trabajo,3000),costo_mano_obra:num(f.costo_mano_obra??0),estado:'pendiente'});record.total+=record.costo_mano_obra;s.servs.unshift(record)}
 }else throw Error('Operación desconocida');
 s.auditoria??=[];s.auditoria.unshift({id,fecha:new Date().toISOString(),usuario:actor,accion:a.kind,documento:a.id||id});s.revision++;if(a.requestId)db.prepare('INSERT INTO requests VALUES(?,?)').run(a.requestId,fingerprint);db.prepare('UPDATE app SET data=? WHERE id=1').run(JSON.stringify(s));db.exec('COMMIT');return s;
 }catch(e){db.exec('ROLLBACK');throw e}}
 return {read,change,addUser,verifyUser,listUsers,close:()=>db.close()};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const store=openStore(resolve(process.env.DATA_DIR||resolve(root,'data'),'motoshop.sqlite'));
 const bootstrap=process.env.SCORTA_ADMIN_PASSWORD;
 if(!store.listUsers().length&&bootstrap){store.addUser(process.env.SCORTA_ADMIN_USER||'admin',bootstrap,'admin')}
 if(process.env.NODE_ENV==='production'&&!store.listUsers().length)throw Error('Configura SCORTA_ADMIN_PASSWORD con al menos 16 caracteres para crear el primer administrador');
 const hash=x=>createHash('sha256').update(x).digest();
 const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
 let actor={username:'local',role:'admin'};if(store.listUsers().length){const auth=Buffer.from((req.headers.authorization||'').replace(/^Basic /,''),'base64').toString();const colon=auth.indexOf(':');actor=colon>=0?store.verifyUser(auth.slice(0,colon),auth.slice(colon+1)):null;if(!actor){res.writeHead(401,{'WWW-Authenticate':'Basic realm=\"SCORTA\", charset=\"UTF-8\"'});return res.end('Acceso protegido')}}

 try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/')){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method==='GET'&&path==='/api/session')return res.end(JSON.stringify(actor));
 if(req.method==='GET'&&path==='/api/users'){if(actor.role!=='admin')throw Error('Acceso restringido');return res.end(JSON.stringify(store.listUsers()))}
 if(req.method==='GET'&&path==='/api/state')return res.end(JSON.stringify(store.read()));
 if(req.method==='GET'&&path==='/api/backup'){if(actor.role!=='admin')throw Error('Acceso restringido');res.setHeader('Content-Disposition','attachment; filename="motoshop-respaldo.json"');return res.end(JSON.stringify(store.read(),null,2))}
 if(req.method==='POST'&&['/api/change','/api/users'].includes(path)){
 if(req.headers.origin&&req.headers.origin!==`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`)throw Error('Origen no autorizado');
 if(!req.headers['content-type']?.startsWith('application/json'))throw Error('Formato inválido');let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000)throw Error('Solicitud demasiado grande')};const payload=JSON.parse(body);if(path==='/api/users'){if(actor.role!=='admin')throw Error('Acceso restringido');store.addUser(payload.username,payload.password,payload.role);return res.end(JSON.stringify(store.listUsers()))}if(actor.role!=='admin'&&!['venta','servicio','estado'].includes(payload.kind))throw Error('No tienes permiso para esta operación');return res.end(JSON.stringify(store.change(payload,actor.username)));
 }res.statusCode=404;return res.end('{}');}
 if(req.method!=='GET'){res.statusCode=405;return res.end()}
 const file=resolve(root,'dist','.'+(path==='/'?'/index.html':decodeURIComponent(path)));
 if(!file.startsWith(resolve(root,'dist')+'/')&&!file.startsWith(resolve(root,'dist')+'\\'))throw Error('Ruta inválida');
 if(!existsSync(file)){res.statusCode=404;return res.end('No encontrado')}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream'));res.end(readFileSync(file));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}))}
 });server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('SCORTA listo en http://localhost:'+(process.env.PORT||3000)));
}


