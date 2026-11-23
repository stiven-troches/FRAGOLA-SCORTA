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
 const f=await fixture();let r=await f.act('seller',{type:'mechanic.create',form:{name:'Carlos',percentage:60}});assert.equal(r.status,403);
 r=await f.act('admin',{type:'mechanic.create',form:{name:'Carlos',percentage:60}});assert.equal(r.status,200,r.body.error);const mechanic=r.body.state.mechanics[0];
 assert.equal(mechanic.active,true);assert.ok(mechanic.createdAt&&mechanic.updatedAt);
 assert.equal((await f.act('admin',{type:'mechanic.create',form:{name:'cárlos',percentage:60}})).status,400);
 let seller=await f.data('seller');assert.deepEqual(seller.state.mechanics,[{id:mechanic.id,name:'Carlos'}]);assert.ok(!Object.hasOwn(seller.state,'cashClosures'));
 assert.deepEqual((await f.data('other')).state.mechanics,[]);
 assert.equal((await f.act('other',{type:'mechanic.update',id:mechanic.id,form:{name:'Otro'}})).status,404);
 assert.equal((await f.act('seller',{type:'mechanic.archive',id:mechanic.id})).status,403);
 assert.equal((await f.act('admin',{type:'mechanic.archive',id:mechanic.id})).status,200);assert.deepEqual((await f.data('seller')).state.mechanics,[]);
 assert.equal((await f.act('admin',{type:'mechanic.update',id:mechanic.id,form:{name:'Carlos activo',active:true}})).status,200);
 assert.equal((await f.data('seller')).state.mechanics[0].name,'Carlos activo');
});

test('mano de obra selecciona el mecánico activo, fija su nombre y porcentaje históricos y rechaza nombres libres',async()=>{
 const f=await fixture();let r=await f.act('admin',{type:'mechanic.create',form:{name:'Ana',percentage:60}});const mechanic=r.body.state.mechanics[0];
 const sale=await f.sell('seller',{quantity:0,labor:[{descripcion:'Cambio de frenos',mecanico:'Nombre no confiable',importe:25000,mecanicoId:mechanic.id}]});
 assert.equal(sale.labor[0].mecanico,'Ana');assert.equal(sale.labor[0].mecanicoId,mechanic.id);
 assert.equal((await f.act('admin',{type:'mechanic.update',id:mechanic.id,form:{name:'Ana editada'}})).status,200);
 let data=await f.data();assert.equal(data.state.ventas.find(s=>s.id===sale.id).labor[0].mecanico,'Ana');
 await f.act('admin',{type:'mechanic.archive',id:mechanic.id});
 r=await f.act('seller',{type:'sale.create',form:{fecha:day,placa:'ABC12D',paymentMethod:'efectivo'},items:[],labor:[{descripcion:'Otro trabajo',mecanico:'Ana',importe:1000,mecanicoId:mechanic.id}]});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_MECHANIC');
 const external=await f.act('other',{type:'mechanic.create',form:{name:'Mecánico de otra empresa',percentage:60}});
 r=await f.act('admin',{type:'sale.create',form:{fecha:day,placa:'ABC12D',paymentMethod:'efectivo'},items:[],labor:[{descripcion:'Otro trabajo',mecanico:'Otro',importe:1000,mecanicoId:external.body.state.mechanics[0].id}]});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_MECHANIC');
 const before=structuredClone(f.getState());r=await f.act('seller',{type:'sale.create',form:{fecha:day,placa:'ABC12D',paymentMethod:'efectivo'},items:[],labor:[{descripcion:'Nombre libre',mecanico:'No registrado',importe:1000}]});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_MECHANIC');assert.deepEqual(f.getState(),before);
});

test('borrador conserva mecanicoId y un reintento protegido confirma una sola venta',async()=>{
 const f=await fixture(),r=await f.act('admin',{type:'mechanic.create',form:{name:'Carlos',percentage:60}}),mechanic=r.body.state.mechanics[0],requestId=crypto.randomUUID();
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
 const mechanicCreated=await f.act('admin',{type:'mechanic.create',form:{name:'Carlos',percentage:60}});
 await f.sell('admin',{method:'tarjeta',quantity:0,labor:[{descripcion:'Trabajo',mecanico:'Carlos',mecanicoId:mechanicCreated.body.state.mechanics[0].id,importe:15000}]});
 let reversed=await f.act('admin',{type:'sale.reverse',id:transfer.id,form:{motivo:'Retorna una unidad',parcial:true},items:[{index:0,cantidad:1}]});assert.equal(reversed.status,200,reversed.body.error);
 const before=await f.data(),stock=before.state.prods[0].stock,requestId='cash-once';
 const body={type:'cash.close',requestId,revision:before.revision,form:{date:day,actual:{efectivo:19500,transferencia:10000,tarjeta:16000},note:'Conteo de ventas del día'}};
 let closed=await f.act('admin',body);assert.equal(closed.status,200,closed.body.error);const record=closed.body.state.cashClosures[0];
 assert.deepEqual(record.expected,{efectivo:20000,transferencia:10000,tarjeta:15000});assert.deepEqual(record.differences,{efectivo:-500,transferencia:0,tarjeta:1000});assert.deepEqual(record.totals,{expected:45000,actual:45500,difference:500});assert.equal(closed.body.state.prods[0].stock,stock);assert.ok(record.userId&&record.createdAt);assert.equal(record.businessRevision,before.revision);
 const retry=await f.act('admin',body);assert.equal(retry.status,200,retry.body.error);assert.equal(retry.body.state.cashClosures.length,1);
 const late=await f.act('seller',{type:'sale.create',form:{fecha:day,cliente:'Cliente',paymentMethod:'efectivo'},items:[{producto_id:before.state.prods[0].id,cantidad:1,precio_unitario:before.state.prods[0].precio_venta}]});assert.equal(late.status,409);assert.equal(late.body.code,'CASH_ALREADY_CLOSED');assert.deepEqual((await f.data()).state.cashClosures[0],record);
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
  let r=await store.request({method:'POST',path:'/api/v2/action',token:adminToken,body:{type:'mechanic.create',form:{name:'Carlos',percentage:60}}},{now:clock});assert.equal(r.status,200,r.body.error);
  r=await store.request({method:'POST',path:'/api/v2/action',token:adminToken,body:{type:'cash.close',form:{date:day,actual:{efectivo:0,transferencia:0,tarjeta:0}}}},{now:clock});assert.equal(r.status,200,r.body.error);
  const business=r.body.state;store.close();store=await openPlatformStore(file);
  r=await store.request({method:'GET',path:'/api/v2/data',token:adminToken},{now:clock});assert.deepEqual(r.body.state.mechanics,business.mechanics);assert.deepEqual(r.body.state.cashClosures,business.cashClosures);
 }finally{store?.close();rmSync(directory,{recursive:true,force:true})}
});

test('porcentaje: valida límites, no acepta blancos ni fórmulas y conserva nombre/porcentaje de cada venta',async()=>{
 const f=await fixture();
 for(const percentage of [undefined,'',' ',null,true,-1,101,'abc',12.345]){
  const before=structuredClone(f.getState()),r=await f.act('admin',{type:'mechanic.create',form:{name:'Inválido',percentage}});
  assert.equal(r.status,400);assert.deepEqual(f.getState(),before);
 }
 let r=await f.act('admin',{type:'mechanic.create',form:{name:'Ana',percentage:33.33}});assert.equal(r.status,200,r.body.error);const mechanic=r.body.state.mechanics[0];
 const one=await f.sell('admin',{quantity:0,labor:[{descripcion:'Primero',mecanicoId:mechanic.id,mecanico:'No confiable',mecanicoPorcentaje:100,importe:30000}]});
 assert.equal(one.labor[0].mecanicoPorcentaje,33.33);assert.equal(one.labor[0].mecanico,'Ana');
 r=await f.act('admin',{type:'mechanic.update',id:mechanic.id,form:{percentage:80,name:'Ana editada'}});assert.equal(r.status,200,r.body.error);
 await f.sell('seller',{quantity:0,labor:[{descripcion:'Segundo',mecanicoId:mechanic.id,mecanico:'Ana',importe:10000}]});
 const data=await f.data(),first=data.state.ventas.find(s=>s.id===one.id),second=data.state.ventas.find(s=>s.id!==one.id);
 assert.equal(first.labor[0].mecanicoPorcentaje,33.33);assert.equal(second.labor[0].mecanicoPorcentaje,80);
 r=await f.request('admin','GET',`/api/v2/overview?from=${day}&to=${day}`);assert.equal(r.status,200,r.body.error);
 const totals=r.body.report.totals;assert.equal(totals.laborProfit,22001);assert.equal(totals.mechanicAmount,17999);assert.equal(totals.totalProfit,22001);
 const seller=await f.data('seller');assert.ok(!Object.hasOwn(seller.state.ventas[0].labor[0],'mecanicoPorcentaje'));assert.deepEqual(seller.state.mechanics,[{id:mechanic.id,name:'Ana editada'}]);
 const receipt=await f.request('missing','GET','/api/v2'+new URL(one.receiptUrl).pathname);assert.equal(receipt.status,200);assert.ok(!Object.hasOwn(receipt.body.sale.labor[0],'mecanicoPorcentaje'));
 await f.act('admin',{type:'sale.reverse',id:first.id,form:{motivo:'Anulación prueba',parcial:false},items:[]});
 r=await f.request('admin','GET',`/api/v2/overview?from=${day}&to=${day}`);assert.equal(r.body.report.totals.laborProfit,2000);
});

test('compra múltiple: líneas de Excel se registran en un documento y un reintento no duplica existencias',async()=>{
 const {parsePurchaseRows,purchaseColumns}=await import('../purchase-import.mjs'),f=await fixture();
 let r=await f.act('admin',{type:'business.change',payload:{kind:'producto',form:{nombre:'Filtro',referencia:'FILTRO-2',stock:0,precio_compra:2000,precio_venta:5000}}});assert.equal(r.status,200,r.body.error);
 const p2=r.body.state.prods.find(p=>p.nombre==='Filtro'),p1=f.product;
 const items=parsePurchaseRows([purchaseColumns.map(([,name])=>name),[p1.id,p1.referencia||'',p1.nombre,2,3000],[p2.id,p2.referencia,p2.nombre,3,2000]],r.body.state.prods);
 const action={type:'business.change',requestId:'excel-compra-once',payload:{kind:'compra',form:{fecha:day,proveedor:'Proveedor Excel'},items}};
 r=await f.act('admin',action);assert.equal(r.status,200,r.body.error);const document=r.body.state.compras[0];
 assert.equal(document.detalles.length,2);assert.equal(document.total,12000);assert.equal(document.proveedor,'Proveedor Excel');
 const stock=r.body.state.prods.map(p=>[p.id,p.stock]);assert.equal(r.body.state.prods.find(p=>p.id===p1.id).stock,22);assert.equal(r.body.state.prods.find(p=>p.id===p2.id).stock,3);
 const repeated=await f.act('admin',action);assert.equal(repeated.status,200);assert.equal(repeated.body.state.compras.length,r.body.state.compras.length);assert.deepEqual(repeated.body.state.prods.map(p=>[p.id,p.stock]),stock);
 const before=structuredClone(f.getState());r=await f.act('admin',{...action,requestId:'invalid-excel',payload:{...action.payload,items:[items[0],{...items[1],producto_id:'inexistente'}]}});assert.equal(r.status,400);assert.deepEqual(f.getState(),before);
});
