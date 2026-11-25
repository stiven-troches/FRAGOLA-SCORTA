// Mejoras de operación: errores internos como 500, tope de sesiones por usuario y auditoría acotada.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,STAFF_PASSWORD} from './qa-fixture.mjs';
import {platformRequest,MAX_SESSIONS_PER_USER,OWNER_AUDIT_LIMIT} from '../platform.mjs';
import {isProgrammingError,healthDetailAllowed} from '../server.mjs';

test('un fallo de programación responde 500 sin detalles internos; una validación sigue siendo 400',async()=>{
 const f=await qaPlatform();const S=await f.shop('Errores QA');
 const broken=structuredClone(f.state);broken.users=null;
 const logged=[],original=console.error;console.error=line=>logged.push(String(line));
 let result;
 try{result=await platformRequest(broken,{method:'POST',path:'/api/v2/login',body:{company:S.company.slug,username:'admin',password:STAFF_PASSWORD}},{now:'2026-11-19T15:00:00.000Z'});}
 finally{console.error=original}
 assert.equal(result.status,500);assert.equal(result.body.code,'INTERNAL_ERROR');assert.doesNotMatch(result.body.error,/null|undefined|read/i);
 assert.ok(logged.some(line=>/internal-error/.test(line)),'la traza queda en el log');
 const invalid=await f.call(S.admin,'/api/v2/action',{requestId:crypto.randomUUID(),type:'sale.create',form:{paymentMethod:'efectivo'},items:[],labor:[]});
 assert.equal(invalid.status,400);
 assert.equal(isProgrammingError(new TypeError('x')),true);assert.equal(isProgrammingError(Error('Monto inválido')),false);
 assert.equal(isProgrammingError(new SyntaxError('Unexpected token in JSON')),false);
});

test('cada usuario conserva como máximo 10 sesiones abiertas: al entrar de nuevo se cierran las más antiguas',async()=>{
 const f=await qaPlatform();const S=await f.shop('Sesiones QA');
 const actors=[];for(let i=0;i<MAX_SESSIONS_PER_USER+3;i++){const actor='dispositivo'+i;actors.push(actor);f.setNow(new Date(Date.parse('2026-11-19T15:00:00.000Z')+i*60000).toISOString());await f.login(actor,S.company.slug,'vendedor');}
 const user=f.state.users.find(u=>u.companyId===S.company.id&&u.username==='vendedor');
 assert.equal(Object.values(f.state.sessions).filter(s=>s.userId===user.id).length,MAX_SESSIONS_PER_USER);
 assert.equal((await f.call(actors[0])).status,401,'la sesión más antigua se cerró');
 ok(await f.call(actors.at(-1)));
});

test('el propietario recibe solo la auditoría reciente, con el total',async()=>{
 const f=await qaPlatform();
 const state=structuredClone(f.state);for(let i=0;i<OWNER_AUDIT_LIMIT+5;i++)state.audit.push({id:'a'+i,fecha:'2026-11-01T00:00:00.000Z',accion:'prueba'});f.state=state;
 const body=await f.data('owner');
 assert.equal(body.audit.length,OWNER_AUDIT_LIMIT);assert.equal(body.auditTotal,state.audit.length);
});

test('/healthz: el detalle exige un token largo y correcto',()=>{
 const req=authorization=>({headers:authorization?{authorization}:{}});
 assert.equal(healthDetailAllowed(req('Bearer abcdefghijklmnop1234'),'abcdefghijklmnop1234'),true);
 assert.equal(healthDetailAllowed(req('Bearer otro'),'abcdefghijklmnop1234'),false);
 assert.equal(healthDetailAllowed(req(),'abcdefghijklmnop1234'),false);
 assert.equal(healthDetailAllowed(req('Bearer corto'),'corto'),false,'un token corto no habilita el detalle');
 assert.equal(healthDetailAllowed(req('Bearer x'),undefined),false);
});

test('catálogo público: tope de checkout por IP y sin escrituras en la base',async()=>{
 const {createServer}=await import('node:http'),{mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {openPlatformStore,createPlatformHandler}=await import('../platform-server.mjs');
 const directory=mkdtempSync(join(tmpdir(),'scorta-catalog-limit-'));
 const store=await openPlatformStore(join(directory,'platform.sqlite'),{owner:{company:'Fragola',username:'owner',name:'Owner',password:'QaOwnerOnly-2026!'}});
 const handler=createPlatformHandler({store,clientIpHeader:'cf-connecting-ip'});
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const before=store.stats().stateBytes;
  const post=ip=>fetch(base+'/api/v2/catalog/no-existe/checkout',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'cf-connecting-ip':ip},body:JSON.stringify({items:[{id:'x',quantity:1}]})});
  const statuses=[];for(let i=0;i<21;i++)statuses.push((await post('203.0.113.7')).status);
  assert.deepEqual(statuses,[...Array(20).fill(404),429]);
  assert.equal((await post('198.51.100.8')).status,404,'otra IP no queda bloqueada');
  assert.equal(store.stats().stateBytes,before,'el checkout no reescribe el estado');
 }finally{await new Promise(resolve=>server.close(resolve));store.close();rmSync(directory,{recursive:true,force:true})}
});

test('recarga de datos: 304 si no cambió y respuesta comprimida',async()=>{
 const {createServer}=await import('node:http'),{mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{gunzipSync}=await import('node:zlib'),http=await import('node:http');
 const {openPlatformStore,createPlatformHandler}=await import('../platform-server.mjs');
 const directory=mkdtempSync(join(tmpdir(),'scorta-etag-'));
 const store=await openPlatformStore(join(directory,'platform.sqlite'),{owner:{company:'Fragola',username:'owner',name:'Owner',password:'QaOwnerOnly-2026!'}});
 const handler=createPlatformHandler({store});
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 // http.get crudo: fetch descomprime solo y no deja ver la codificación.
 const raw=(path,headers)=>new Promise((resolve,reject)=>{http.get(base+path,{headers:{'x-scorta-company':'@owner',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))}).on('error',reject)});
 try{
  const login=await fetch(base+'/api/v2/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({company:'Fragola',username:'owner',password:'QaOwnerOnly-2026!'})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const first=await raw('/api/v2/data',{cookie,'accept-encoding':'gzip'});
  assert.equal(first.status,200);assert.match(first.headers.etag,/^W\/"/);
  if(first.headers['content-encoding']==='gzip')assert.ok(JSON.parse(gunzipSync(first.body)).session);else assert.ok(first.body.length<1024);
  const again=await raw('/api/v2/data',{cookie,'if-none-match':first.headers.etag});
  assert.equal(again.status,304);assert.equal(again.body.length,0);
  const other=await raw('/api/v2/data',{cookie,'if-none-match':'W/"otro"'});assert.equal(other.status,200);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();rmSync(directory,{recursive:true,force:true})}
});

test('archivos estáticos de texto se comprimen según Accept-Encoding',async()=>{
 const {compressStatic}=await import('../server.mjs'),{brotliDecompressSync,gunzipSync}=await import('node:zlib');
 const content=Buffer.from('console.log("scorta");'.repeat(200)),headers={};
 const res={setHeader(k,v){headers[k.toLowerCase()]=v}};
 const br=compressStatic({headers:{'accept-encoding':'gzip, br'}},res,'x/app.js',content,false);
 assert.equal(headers['content-encoding'],'br');assert.deepEqual(brotliDecompressSync(br),content);assert.ok(br.length<content.length/5);
 const gz=compressStatic({headers:{'accept-encoding':'gzip'}},{setHeader(k,v){headers[k.toLowerCase()]=v}},'x/app.css',content,false);
 assert.deepEqual(gunzipSync(gz),content);
 const png=Buffer.alloc(5000);assert.equal(compressStatic({headers:{'accept-encoding':'br'}},{setHeader(){throw Error('no debe tocar cabeceras')}},'x/logo.png',png),png);
});
