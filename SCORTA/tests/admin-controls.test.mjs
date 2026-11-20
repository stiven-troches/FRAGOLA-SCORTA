import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPlatform,platformRequest} from '../platform.mjs';
import {openPlatformStore} from '../platform-server.mjs';

const clock='2026-11-20T15:00:00.000Z',day='2026-11-20',password='Admin.Fixture.2026';
const owner={company:'Fragola',username:'owner',password};
async function fixture(){
 let state=await createPlatform({owner}),tokens={};
 const request=async(actor,method,path,body)=>{const r=await platformRequest(state,{method,path,body,token:tokens[actor]},{now:clock});state=r.state;if(Object.hasOwn(r,'token'))tokens[actor]=r.token;return r};
 const act=(actor,action)=>request(actor,'POST','/api/v2/action',{requestId:crypto.randomUUID(),...action});
 const login=async(actor,company,username)=>{const r=await request(actor,'POST','/api/v2/login',{company,username,password});assert.equal(r.status,200,r.body.error);return r.body};
 const data=async(actor='admin')=>{const r=await request(actor,'GET','/api/v2/data');assert.equal(r.status,200,r.body.error);return r.body};
 await login('owner','Fragola','owner');
 const createCompany=async name=>{const r=await act('owner',{type:'company.create',form:{name,username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31'}});assert.equal(r.status,200,r.body.error);return r.body.companies.find(c=>c.name===name)};
 const company=await createCompany('Moto Control'),other=await createCompany('Moto Aislada');
 assert.equal((await act('owner',{type:'user.create',companyId:company.id,form:{username:'seller',role:'vendedor',password}})).status,200);
 await login('admin',company.name,'admin');await login('other',other.name,'admin');await login('seller',company.name,'seller');
 const created=await act('admin',{type:'business.change',payload:{kind:'producto',form:{nombre:'Aceite',stock:20,stock_minimo:3,precio_compra:4000,precio_venta:10000}}});assert.equal(created.status,200,created.body.error);
 const product=created.body.state.prods[0];
 const sell=async(actor='admin',{method='efectivo',quantity=1,labor=[]}={})=>{const r=await act(actor,{type:'sale.create',form:{fecha:day,cliente:'Cliente',placa:labor.length?'ABC12D':'',paymentMethod:method},items:quantity?[{producto_id:product.id,cantidad:quantity,precio_unitario:product.precio_venta}]:[],labor});assert.equal(r.status,200,r.body.error);return r.body.state.ventas[0]};
 return {act,request,data,company,other,product,sell,getState:()=>state};
}

test('mecánicos: gestión solo admin, selector del vendedor limitado y aislamiento entre empresas',async()=>{
 const f=await fixture();let r=await f.act('seller',{type:'mechanic.create',form:{name:'Carlos'}});assert.equal(r.status,403);
 r=await f.act('admin',{type:'mechanic.create',form:{name:'Carlos'}});assert.equal(r.status,200,r.body.error);const mechanic=r.body.state.mechanics[0];
 assert.equal(mechanic.active,true);assert.ok(mechanic.createdAt&&mechanic.updatedAt);
 assert.equal((await f.act('admin',{type:'mechanic.create',form:{name:'cárlos'}})).status,400);
 let seller=await f.data('seller');assert.deepEqual(seller.state.mechanics,[{id:mechanic.id,name:'Carlos'}]);assert.ok(!Object.hasOwn(seller.state,'cashClosures'));
 assert.deepEqual((await f.data('other')).state.mechanics,[]);
 assert.equal((await f.act('other',{type:'mechanic.update',id:mechanic.id,form:{name:'Otro'}})).status,404);
 assert.equal((await f.act('seller',{type:'mechanic.archive',id:mechanic.id})).status,403);
 assert.equal((await f.act('admin',{type:'mechanic.archive',id:mechanic.id})).status,200);assert.deepEqual((await f.data('seller')).state.mechanics,[]);
 assert.equal((await f.act('admin',{type:'mechanic.update',id:mechanic.id,form:{name:'Carlos activo',active:true}})).status,200);
 assert.equal((await f.data('seller')).state.mechanics[0].name,'Carlos activo');
});

test('mano de obra selecciona el mecánico activo, fija su nombre histórico y admite registros anteriores',async()=>{
 const f=await fixture();let r=await f.act('admin',{type:'mechanic.create',form:{name:'Ana'}});const mechanic=r.body.state.mechanics[0];
 const sale=await f.sell('seller',{quantity:0,labor:[{descripcion:'Cambio de frenos',mecanico:'Nombre no confiable',importe:25000,mecanicoId:mechanic.id}]});
 assert.equal(sale.labor[0].mecanico,'Ana');assert.equal(sale.labor[0].mecanicoId,mechanic.id);
 assert.equal((await f.act('admin',{type:'mechanic.update',id:mechanic.id,form:{name:'Ana editada'}})).status,200);
 let data=await f.data();assert.equal(data.state.ventas.find(s=>s.id===sale.id).labor[0].mecanico,'Ana');
 await f.act('admin',{type:'mechanic.archive',id:mechanic.id});
 r=await f.act('seller',{type:'sale.create',form:{fecha:day,placa:'ABC12D',paymentMethod:'efectivo'},items:[],labor:[{descripcion:'Otro trabajo',mecanico:'Ana',importe:1000,mecanicoId:mechanic.id}]});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_MECHANIC');
 const external=await f.act('other',{type:'mechanic.create',form:{name:'Mecánico de otra empresa'}});
 r=await f.act('admin',{type:'sale.create',form:{fecha:day,placa:'ABC12D',paymentMethod:'efectivo'},items:[],labor:[{descripcion:'Otro trabajo',mecanico:'Otro',importe:1000,mecanicoId:external.body.state.mechanics[0].id}]});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_MECHANIC');
 const legacy=await f.sell('seller',{quantity:0,labor:[{descripcion:'Servicio con borrador anterior',mecanico:'Nombre histórico',importe:1000}]});assert.equal(legacy.labor[0].mecanico,'Nombre histórico');assert.ok(!Object.hasOwn(legacy.labor[0],'mecanicoId'));
});

test('borrador conserva mecanicoId y un reintento protegido confirma una sola venta',async()=>{
 const f=await fixture(),r=await f.act('admin',{type:'mechanic.create',form:{name:'Carlos'}}),mechanic=r.body.state.mechanics[0],requestId=crypto.randomUUID();
 const form={cliente:'Cliente',telefono:'',placa:'ABC12D',fecha:day,paymentMethod:'efectivo'},labor=[{descripcion:'Cambio de aceite',mecanico:'Carlos',importe:18000,mecanicoId:mechanic.id}];
 const pendingSale={type:'sale.create',requestId,draftRequestId:requestId,form,items:[],labor};
 const draft={cart:[],labor:[{...labor[0],key:'service-1'}],laborDraft:{descripcion:'',mecanico:'',importe:''},saleForm:form,pendingSale};
 let saved=await f.request('seller','POST','/api/v2/draft',{version:0,writeId:'draft-mechanic',draft});assert.equal(saved.status,200,saved.body.error);assert.equal(saved.body.draft.labor[0].mecanicoId,mechanic.id);assert.equal(saved.body.draft.pendingSale.labor[0].mecanicoId,mechanic.id);
 const first=await f.act('seller',pendingSale);assert.equal(first.status,200,first.body.error);
 const repeated=await f.act('seller',pendingSale);assert.equal(repeated.status,200,repeated.body.error);assert.equal(repeated.body.state.ventas.length,first.body.state.ventas.length);
 saved=await f.request('seller','GET','/api/v2/draft');assert.equal(saved.body.draft,null);
});

test('cierre por ventas netas: snapshot inmutable, diferencias e idempotencia sin afectar existencias',async()=>{
 const f=await fixture();await f.sell('seller',{method:'efectivo',quantity:2});const transfer=await f.sell('admin',{method:'transferencia',quantity:2});
 await f.sell('admin',{method:'tarjeta',quantity:0,labor:[{descripcion:'Trabajo',mecanico:'Carlos',importe:15000}]});
 let reversed=await f.act('admin',{type:'sale.reverse',id:transfer.id,form:{motivo:'Retorna una unidad',parcial:true},items:[{index:0,cantidad:1}]});assert.equal(reversed.status,200,reversed.body.error);
 const before=await f.data(),stock=before.state.prods[0].stock,requestId='cash-once';
 const body={type:'cash.close',requestId,revision:before.revision,form:{date:day,actual:{efectivo:19500,transferencia:10000,tarjeta:16000},note:'Conteo de ventas del día'}};
 let closed=await f.act('admin',body);assert.equal(closed.status,200,closed.body.error);const record=closed.body.state.cashClosures[0];
 assert.deepEqual(record.expected,{efectivo:20000,transferencia:10000,tarjeta:15000});assert.deepEqual(record.differences,{efectivo:-500,transferencia:0,tarjeta:1000});assert.deepEqual(record.totals,{expected:45000,actual:45500,difference:500});assert.equal(closed.body.state.prods[0].stock,stock);assert.ok(record.userId&&record.createdAt);assert.equal(record.businessRevision,before.revision);
 const retry=await f.act('admin',body);assert.equal(retry.status,200,retry.body.error);assert.equal(retry.body.state.cashClosures.length,1);
 await f.sell();assert.deepEqual((await f.data()).state.cashClosures[0],record);
 closed=await f.act('admin',{type:'cash.close',form:body.form});assert.equal(closed.status,409);assert.equal(closed.body.code,'CASH_ALREADY_CLOSED');
 assert.equal((await f.act('seller',{type:'cash.close',form:{date:day,actual:{efectivo:0,transferencia:0,tarjeta:0}}})).status,403);
 assert.ok(!Object.hasOwn((await f.data('seller')).state,'cashClosures'));assert.deepEqual((await f.data('other')).state.cashClosures,[]);
 assert.equal((await f.act('other',{type:'cash.close',form:{date:day,actual:{efectivo:0,transferencia:0,tarjeta:0}}})).status,200);
});

test('reportes y cierres validan permisos, fechas y cantidades y no exponen otra empresa',async()=>{
 const f=await fixture();await f.sell();
 let r=await f.request('admin','GET',`/api/v2/reports?from=${day}&to=${day}`);assert.equal(r.status,200,r.body.error);assert.equal(r.body.report.totals.net,10000);
 assert.equal((await f.request('seller','GET','/api/v2/reports')).status,403);assert.equal((await f.request('owner','GET','/api/v2/reports')).status,403);assert.equal((await f.request('missing','GET','/api/v2/reports')).status,401);
 r=await f.request('other','GET',`/api/v2/reports?from=${day}&to=${day}&companyId=${f.company.id}`);assert.equal(r.status,200);assert.equal(r.body.report.totals.net,0);
 for(const query of ['from=bad','from=2026-02-30','from=2026-12-01&to=2026-11-01'])assert.equal((await f.request('admin','GET','/api/v2/reports?'+query)).status,400);
 const before=structuredClone((await f.data()).state);
 for(const form of [{date:'2026-11-21',actual:{efectivo:0,transferencia:0,tarjeta:0}},{date:day,actual:{efectivo:-1,transferencia:0,tarjeta:0}},{date:day,actual:{efectivo:0,transferencia:0}},{date:day,actual:{efectivo:true,transferencia:0,tarjeta:0}}])assert.equal((await f.act('admin',{type:'cash.close',form})).status,400);
 assert.deepEqual((await f.data()).state,before);
});

test('SQLite conserva mecánicos y cierre al reiniciar',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'admin-control-')),file=join(directory,'platform.sqlite');let store;
 try{
  store=await openPlatformStore(file,{owner});
  const sign=await store.request({method:'POST',path:'/api/v2/login',body:owner},{now:clock}),token=sign.token;
  const created=await store.request({method:'POST',path:'/api/v2/action',token,body:{type:'company.create',form:{name:'Moto Persistente',username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31'}}},{now:clock});assert.equal(created.status,200,created.body.error);
  const signed=await store.request({method:'POST',path:'/api/v2/login',body:{company:'Moto Persistente',username:'admin',password}},{now:clock}),adminToken=signed.token;
  let r=await store.request({method:'POST',path:'/api/v2/action',token:adminToken,body:{type:'mechanic.create',form:{name:'Carlos'}}},{now:clock});assert.equal(r.status,200,r.body.error);
  r=await store.request({method:'POST',path:'/api/v2/action',token:adminToken,body:{type:'cash.close',form:{date:day,actual:{efectivo:0,transferencia:0,tarjeta:0}}}},{now:clock});assert.equal(r.status,200,r.body.error);
  const business=r.body.state;store.close();store=await openPlatformStore(file);
  r=await store.request({method:'GET',path:'/api/v2/data',token:adminToken},{now:clock});assert.deepEqual(r.body.state.mechanics,business.mechanics);assert.deepEqual(r.body.state.cashClosures,business.cashClosures);
 }finally{store?.close();rmSync(directory,{recursive:true,force:true})}
});
