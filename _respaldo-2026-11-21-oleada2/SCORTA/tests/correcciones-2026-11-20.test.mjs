import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createPlatform,platformRequest} from '../platform.mjs';
import {openPlatformStore,createPlatformHandler} from '../platform-server.mjs';

const clock='2026-11-20T15:00:00.000Z',today='2026-11-20',password='Admin.Fixture.2026';
const owner={company:'Fragola',username:'owner',password};

async function fixture(){
  let state=await createPlatform({owner}),tokens={};
  const request=async(actor,method,path,body)=>{const r=await platformRequest(state,{method,path,body,token:tokens[actor]},{now:clock});state=r.state;if(Object.hasOwn(r,'token'))tokens[actor]=r.token;return r};
  const act=(actor,action)=>request(actor,'POST','/api/v2/action',{requestId:crypto.randomUUID(),...action});
  const login=async(actor,username)=>{const r=await request(actor,'POST','/api/v2/login',{company:'Moto Fecha',username,password});assert.equal(r.status,200,r.body.error)};
  await request('owner','POST','/api/v2/login',{company:'Fragola',username:'owner',password});
  const created=await act('owner',{type:'company.create',form:{name:'Moto Fecha',username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31'}});assert.equal(created.status,200,created.body.error);
  const company=created.body.companies.find(c=>c.name==='Moto Fecha');
  for(const username of ['seller','seller2'])assert.equal((await act('owner',{type:'user.create',companyId:company.id,form:{username,role:'vendedor',password}})).status,200);
  await login('admin','admin');await login('seller','seller');await login('seller2','seller2');
  const product=(await act('admin',{type:'business.change',payload:{kind:'producto',form:{nombre:'Aceite',stock:50,stock_minimo:1,precio_compra:4000,precio_venta:10000}}})).body.state.prods[0];
  const sell=(actor,form={})=>act(actor,{type:'sale.create',form:{paymentMethod:'efectivo',...form},items:[{producto_id:product.id,cantidad:1,precio_unitario:product.precio_venta}]});
  return {act,request,sell,getState:()=>state,companyId:company.id};
}

test('fecha de venta: el vendedor siempre registra hoy y el admin no puede usar fechas futuras ni días cerrados',async()=>{
  const f=await fixture();
  let r=await f.sell('seller',{fecha:'2026-11-10'});assert.equal(r.status,200,r.body.error);assert.equal(r.body.state.ventas[0].fecha,today);
  r=await f.sell('seller',{fecha:'2031-01-01'});assert.equal(r.status,200);assert.equal(r.body.state.ventas[0].fecha,today);
  r=await f.sell('admin',{fecha:'2026-12-01'});assert.equal(r.status,400);
  r=await f.sell('admin',{fecha:'2026-11-18'});assert.equal(r.status,200,r.body.error);assert.equal(r.body.state.ventas[0].fecha,'2026-11-18');
  const closed=await f.act('admin',{type:'cash.close',form:{date:'2026-11-18',actual:{efectivo:10000,transferencia:0,tarjeta:0}}});assert.equal(closed.status,200,closed.body.error);
  const before=structuredClone(f.getState().businesses[f.companyId].ventas);
  r=await f.sell('admin',{fecha:'2026-11-18'});assert.equal(r.status,409);assert.equal(r.body.code,'CASH_ALREADY_CLOSED');
  assert.deepEqual(f.getState().businesses[f.companyId].ventas,before);
});

test('vendedor: no recibe clientes de ventas ajenas ni puede renombrar el registro compartido',async()=>{
  const f=await fixture();
  assert.equal((await f.sell('seller2',{cliente:'Juan VIP',telefono:'3001234567'})).status,200);
  let r=await f.sell('seller',{cliente:'Otro Nombre',telefono:'3001234567'});assert.equal(r.status,200,r.body.error);
  assert.equal(r.body.state.customerRecords,undefined);
  assert.equal(r.body.state.customers.length,1);assert.equal(r.body.state.customers[0].totalSpent,10000);
  assert.equal(r.body.state.ventas[0].cliente,'Otro Nombre');
  const record=f.getState().businesses[f.companyId].customerRecords.find(c=>c.telefono==='3001234567');assert.equal(record.nombre,'Juan VIP');
  r=await f.request('admin','GET','/api/v2/data');assert.equal(r.body.state.customers[0].totalSpent,20000);
});

test('estado acotado: leer un ticket no se audita, tickets abiertos limitados y enlaces vencidos depurados',async()=>{
  const f=await fixture();
  const created=await f.act('seller',{type:'ticket.create',form:{title:'Ayuda',description:'Detalle'}});assert.equal(created.status,200,created.body.error);
  const auditBefore=f.getState().audit.length;
  assert.equal((await f.act('seller',{type:'ticket.read',id:created.body.tickets[0].id})).status,200);
  assert.equal(f.getState().audit.length,auditBefore);
  for(let i=1;i<50;i++)assert.equal((await f.act('seller',{type:'ticket.create',form:{title:'T'+i,description:'D'}})).status,200);
  const limited=await f.act('admin',{type:'ticket.create',form:{title:'Uno más',description:'D'}});assert.equal(limited.status,429);assert.equal(limited.body.code,'TICKET_LIMIT');
  assert.equal((await f.sell('seller')).status,200);
  assert.equal(Object.keys(f.getState().receipts).length,1);
  const later=await platformRequest(f.getState(),{method:'POST',path:'/api/v2/logout',body:{}},{now:'2026-12-01T15:00:00.000Z'});
  assert.equal(Object.keys(later.state.receipts).length,0);
});

test('propietario: sesión de 12 horas y soporte que termina solo a las 2 horas',async()=>{
  const f=await fixture(),at=offset=>new Date(Date.parse(clock)+offset).toISOString();
  const login=await platformRequest(f.getState(),{method:'POST',path:'/api/v2/login',body:{company:'Fragola',username:'owner',password}},{now:clock});
  const token=login.token;
  const started=await platformRequest(login.state,{method:'POST',path:'/api/v2/action',body:{type:'support.start',companyId:f.companyId,form:{motivo:'Soporte'}},token},{now:clock});
  assert.equal(started.status,200,started.body.error);const s=started.state;
  let r=await platformRequest(s,{method:'GET',path:'/api/v2/data',token},{now:at(3600000)});assert.equal(r.body.session.companyId,f.companyId);
  r=await platformRequest(s,{method:'GET',path:'/api/v2/data',token},{now:at(2*3600000+1000)});assert.equal(r.status,200);assert.equal(r.body.session.companyId,null);assert.equal(r.body.session.support,null);
  r=await platformRequest(s,{method:'GET',path:'/api/v2/data',token},{now:at(12*3600000+1000)});assert.equal(r.status,401);
});

test('bloqueo PID huérfano de este mismo proceso no impide abrir la plataforma',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-pid-')),file=join(dir,'platform.sqlite');
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  writeFileSync(file+'.pid',String(process.pid));
  const store=await openPlatformStore(file,{owner});
  try{assert.equal(store.health(),true);}finally{store.close();}
});

test('HTTP: la IP del cliente sale de la cabecera configurada y los errores internos no filtran detalles',async t=>{
  const seen=[];
  const store={request:async payload=>{seen.push(payload.clientKey);if(payload.path==='/api/v2/data')throw Error('SQLITE_CORRUPT detalle interno');return {status:200,body:{ok:true}};}};
  const handler=createPlatformHandler({store,clientIpHeader:'X-Forwarded-For'});
  const server=createServer((req,res)=>handler(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const base='http://127.0.0.1:'+server.address().port;
  // SEG-02: x-forwarded-for usa la entrada que añadió el proxy de confianza (la última por defecto), no la primera falsificable.
  await fetch(base+'/api/v2/session',{headers:{'x-forwarded-for':'198.51.100.66, 203.0.113.7'}});
  assert.equal(seen[0],'203.0.113.7');
  const original=console.error;console.error=()=>{};
  try{const r=await fetch(base+'/api/v2/data');assert.equal(r.status,500);const body=await r.json();assert.equal(body.code,'INTERNAL_ERROR');assert.ok(!JSON.stringify(body).includes('SQLITE'));}
  finally{console.error=original;}
});
