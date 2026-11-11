import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// All data and credentials belong to this temporary test instance.
test('sesiones, permisos y ventas por HTTP', {timeout:20000}, async t=>{
 const dir=mkdtempSync(join(tmpdir(),'scorta-http-'));
 const port=19382, base=`http://127.0.0.1:${port}`, origin=`https://127.0.0.1:${port}`;
 const password='UnaClaveSeguraDePrueba123';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,NODE_ENV:'production',SCORTA_ADMIN_PASSWORD:password}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk});
 try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('El servidor no inició: '+stderr)),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve()});child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',code=>{clearTimeout(timer);reject(Error(`Servidor cerró (${code}): ${stderr}`))})});
  const request=(path,{cookie,body,method=body===undefined?'GET':'POST',headers={}}={})=>fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const login=async(username,secret)=>{const r=await request('/api/login',{body:{username,password:secret}});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]};
  let admin,operator,productId,revision,operation;
  await t.test('sin sesión no expone datos; login erróneo no distingue usuarios',async()=>{
   for(const path of ['/api/state','/api/session','/api/backup'])assert.equal((await request(path)).status,401);
   const wrong=await request('/api/login',{body:{username:'admin',password:'incorrecta'}});
   const unknown=await request('/api/login',{body:{username:'nadie',password:'incorrecta'}});
   assert.equal(wrong.status,401);assert.equal(unknown.status,401);assert.deepEqual(await wrong.json(),await unknown.json());
  });
  await t.test('login emite cookie protegida e identifica usuario',async()=>{
   const r=await request('/api/login',{body:{username:'admin',password}});assert.equal(r.status,200);
   const cookie=r.headers.get('set-cookie');for(const marker of ['HttpOnly','SameSite=Strict','Secure','Path=/'])assert.ok(cookie.includes(marker));admin=cookie.split(';')[0];
   const user=await (await request('/api/session',{cookie:admin})).json();assert.equal(user.username,'admin');assert.equal(user.role,'admin');
  });
  await t.test('origen y formato se verifican también en login',async()=>{
   for(const headers of [{Origin:'https://otro.example'},{Origin:''}])assert.equal((await request('/api/login',{body:{username:'admin',password},headers})).status,403);
   assert.equal((await request('/api/logout',{cookie:admin,body:{},headers:{'Content-Type':'text/plain'}})).status,415);
  });
  await t.test('operador no crea productos, consulta usuarios ni respalda datos',async()=>{
   const r=await request('/api/users',{cookie:admin,body:{username:'cajero',password:'SeguraParaCajero12345',role:'operador'}});assert.equal(r.status,200);
   operator=await login('cajero','SeguraParaCajero12345');
   for(const path of ['/api/users','/api/backup'])assert.equal((await request(path,{cookie:operator})).status,403);
   const before=await (await request('/api/state',{cookie:admin})).json();
   for(const kind of ['producto','compra','ajuste','eliminar','importar','reversion'])assert.equal((await request('/api/change',{cookie:operator,body:{kind,revision:before.revision,form:{}}})).status,403);
   assert.deepEqual(await (await request('/api/state',{cookie:admin})).json(),before);
  });
  await t.test('venta del operador descuenta una vez y rechaza edición concurrente',async()=>{
   let state=await (await request('/api/state',{cookie:admin})).json();
   let r=await request('/api/change',{cookie:admin,body:{kind:'producto',revision:state.revision,requestId:'http-producto',form:{nombre:'Casco QA',referencia:'QA-01',stock:3,precio_venta:100,precio_compra:50,stock_minimo:1}}});assert.equal(r.status,200);state=await r.json();productId=state.prods[0].id;revision=state.revision;
   operation={kind:'venta',revision,requestId:'http-venta',form:{fecha:'2026-11-11'},items:[{producto_id:productId,cantidad:2,precio_unitario:100}]};
   r=await request('/api/change',{cookie:operator,body:operation});assert.equal(r.status,200);state=await r.json();assert.equal(state.prods[0].stock,1);assert.equal(state.ventas.length,1);assert.equal(state.auditoria[0].usuario,'cajero');
   r=await request('/api/change',{cookie:operator,body:operation});assert.equal(r.status,200);const repeated=await r.json();assert.equal(repeated.revision,state.revision);assert.equal(repeated.prods[0].stock,1);assert.equal(repeated.ventas.length,1);
   r=await request('/api/change',{cookie:operator,body:{...operation,requestId:'http-conflicto'}});assert.equal(r.status,400);assert.match((await r.json()).error,/Otro usuario/);
   r=await request('/api/change',{cookie:operator,body:{...operation,requestId:'http-sin-stock',revision:state.revision}});assert.equal(r.status,400);assert.match((await r.json()).error,/Stock/);
   assert.deepEqual(await (await request('/api/state',{cookie:admin})).json(),state);
  });
  await t.test('salir invalida la cookie anterior',async()=>{
   const r=await request('/api/logout',{cookie:operator,body:{}});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
   assert.equal((await request('/api/state',{cookie:operator})).status,401);
  });
  await t.test('cambiar contraseña invalida todas las sesiones del usuario',async()=>{
   const second=await login('admin',password),newPassword='OtraClaveNuevaSegura12345';
   let r=await request('/api/password',{cookie:admin,body:{currentPassword:'incorrecta',newPassword}});assert.notEqual(r.status,200);
   r=await request('/api/password',{cookie:admin,body:{currentPassword:password,newPassword}});assert.equal(r.status,200);
   for(const cookie of [admin,second])assert.equal((await request('/api/session',{cookie})).status,401);
   assert.equal((await request('/api/login',{body:{username:'admin',password}})).status,401);
   const changed=await login('admin',newPassword);assert.equal((await request('/api/state',{cookie:changed})).status,200);
  });
 } finally {
  if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited}
  rmSync(dir,{recursive:true,force:true});
 }
});
