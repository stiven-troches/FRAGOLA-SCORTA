// QA-12: respuesta perdida a mitad del cobro. Reintentar con el mismo requestId nunca
// duplica la venta ni devuelve stock dos veces, aunque haya otras operaciones en medio.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPlatformStore} from '../platform-server.mjs';
import {qaPlatform,ok,OWNER_PASSWORD,STAFF_PASSWORD,AT_D} from './qa-fixture.mjs';

const stockOf=(f,shop)=>f.state.businesses[shop.company.id].prods.find(p=>p.id===shop.product.id).stock;
const salesOf=(f,shop)=>f.state.businesses[shop.company.id].ventas;

test('QA-12: cobro con respuesta perdida, otra venta en medio y reintento con el mismo requestId',async()=>{
 const f=await qaPlatform();const S=await f.shop('Idempotencia QA',{stock:10});
 const revision=f.state.businesses[S.company.id].revision;
 const lost={...f.saleBody(S.product,{cantidad:2}),requestId:'cobro-perdido-1',revision};
 ok(await f.call(S.seller,'/api/v2/action',lost)); // la respuesta "se pierde": el cliente no la ve
 // Otra venta de otro vendedor en medio (cambia la revisión del negocio).
 ok(await f.call(S.seller2,'/api/v2/action',{...f.saleBody(S.product),requestId:'venta-en-medio'}));
 assert.equal(stockOf(f,S),7);assert.equal(salesOf(f,S).length,2);
 // Reintentos idénticos (incluida la revisión antigua): 200 sin duplicar ni 409.
 for(let i=0;i<3;i++){
  const retry=await f.call(S.seller,'/api/v2/action',structuredClone(lost));
  assert.equal(retry.status,200,JSON.stringify(retry.body));
  assert.equal(retry.body.state.ventas.filter(s=>s.total===68000).length,1);
 }
 assert.equal(stockOf(f,S),7);assert.equal(salesOf(f,S).length,2);
 // El mismo requestId con otros datos se rechaza y no cambia nada.
 const before=structuredClone(f.state.businesses[S.company.id]);
 const tampered=await f.call(S.seller,'/api/v2/action',{...lost,items:[{...lost.items[0],cantidad:3}]});
 assert.equal(tampered.status,400);assert.match(tampered.body.error,/identificador de operación/);
 assert.deepEqual(f.state.businesses[S.company.id],before);
 // El requestId es por usuario: otro vendedor con el mismo id registra SU venta.
 ok(await f.call(S.seller2,'/api/v2/action',{...f.saleBody(S.product),requestId:'cobro-perdido-1'}));
 assert.equal(salesOf(f,S).length,3);assert.equal(stockOf(f,S),6);
});

test('QA-12: sale.reverse reintentado con el mismo requestId no devuelve el stock dos veces',async()=>{
 const f=await qaPlatform();const S=await f.shop('Reversa QA',{stock:10});
 const sale=(await f.act(S.seller,f.saleBody(S.product,{cantidad:3}))).state.ventas[0];
 assert.equal(stockOf(f,S),7);
 const partial={type:'sale.reverse',id:sale.id,requestId:'devolucion-1',form:{motivo:'Devuelve una',parcial:true},items:[{index:0,cantidad:1}]};
 ok(await f.call(S.admin,'/api/v2/action',partial));
 ok(await f.call(S.seller,'/api/v2/action',{...f.saleBody(S.product),requestId:'otra-venta'})); // operación en medio
 for(let i=0;i<3;i++)ok(await f.call(S.admin,'/api/v2/action',structuredClone(partial)));
 assert.equal(stockOf(f,S),7);
 const stored=salesOf(f,S).find(s=>s.id===sale.id);
 assert.equal(stored.detalles[0].devuelto,1);assert.equal(stored.reversiones.length,1);
 const full={type:'sale.reverse',id:sale.id,requestId:'anulacion-1',form:{motivo:'Anula',parcial:false}};
 ok(await f.call(S.admin,'/api/v2/action',full));ok(await f.call(S.admin,'/api/v2/action',structuredClone(full)));
 assert.equal(stockOf(f,S),9);
 const cancelled=salesOf(f,S).find(s=>s.id===sale.id);assert.equal(cancelled.anulada,true);assert.equal(cancelled.reversiones.length,2);
 // Sin requestId nuevo, una segunda anulación se rechaza (venta ya anulada).
 const again=await f.call(S.admin,'/api/v2/action',{...full,requestId:'anulacion-2'});
 assert.equal(again.status,400);assert.equal(stockOf(f,S),9);
});

test('QA-12: reintento tras respuesta perdida con el store SQLite y reapertura del proceso',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'scorta-qa-retry-')),file=join(directory,'platform.sqlite');
 const owner={company:'Fragola',username:'owner',name:'Owner',password:OWNER_PASSWORD};
 let store=await openPlatformStore(file,{owner});
 try{
  const tokens={};
  const call=(who,path,body)=>store.request({method:body?'POST':'GET',path,body,token:tokens[who]},{now:AT_D});
  const login=async(who,company,username,password)=>{const r=await call(who,'/api/v2/login',{company,username,password});ok(r);tokens[who]=r.token};
  await login('owner','Fragola','owner',OWNER_PASSWORD);
  const created=await call('owner','/api/v2/action',{type:'company.create',requestId:'c1',form:{name:'Reinicio QA',startDate:'2026-11-01',endDate:'2026-12-31',monthlyFee:0,username:'admin',password:STAFF_PASSWORD}});ok(created);
  const company=created.body.companies[0];await login('admin',company.slug,'admin',STAFF_PASSWORD);
  const product=(await call('admin','/api/v2/action',{type:'business.change',requestId:'p1',payload:{kind:'producto',form:{nombre:'Filtro',stock:4,precio_compra:1000,precio_venta:2000}}})).body.state.prods[0];
  const sale={type:'sale.create',requestId:'cobro-sqlite',form:{paymentMethod:'tarjeta'},items:[{producto_id:product.id,cantidad:1,precio_unitario:2000}],labor:[]};
  ok(await call('admin','/api/v2/action',sale));
  // El servidor se reinicia antes de que el cliente reintente.
  store.close();store=await openPlatformStore(file,{owner});
  ok(await call('admin','/api/v2/action',structuredClone(sale)));
  const business=store.readPrivate().businesses[company.id];
  assert.equal(business.ventas.length,1);assert.equal(business.prods[0].stock,3);
 }finally{store.close();rmSync(directory,{recursive:true,force:true})}
});
