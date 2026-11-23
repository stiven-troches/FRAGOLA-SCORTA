// QA-03: pruebas críticas (concurrencia, aislamiento, cierres, respaldos, dinero, permisos).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openPlatformStore} from '../platform-server.mjs';
import {restorePlatformBackup} from '../platform-backup.mjs';
import {roundMoney,sumMoney} from '../money.mjs';
import {qaPlatform,ok,OWNER_PASSWORD,STAFF_PASSWORD,AT_D,AT_D1,DAY_D,DAY_D1} from './qa-fixture.mjs';

const OWNER={company:'Fragola',username:'owner',name:'Owner',password:OWNER_PASSWORD};
const tempDir=prefix=>mkdtempSync(join(tmpdir(),prefix));

// ---------------------------------------------------------------- (a)
async function sqliteShop(directory,stock){
 const store=await openPlatformStore(join(directory,'platform.sqlite'),{owner:OWNER});
 const tokens={};
 const call=async(who,path,body)=>store.request({method:body?'POST':'GET',path,body,token:tokens[who]},{now:AT_D});
 const login=async(who,company,username,password)=>{const r=await call(who,'/api/v2/login',{company,username,password});ok(r);tokens[who]=r.token};
 const act=async(who,body)=>{const r=await call(who,'/api/v2/action',{requestId:crypto.randomUUID(),...body});ok(r);return r.body};
 await login('owner','Fragola','owner',OWNER_PASSWORD);
 const created=await act('owner',{type:'company.create',form:{name:'Concurrencia QA',startDate:'2026-11-01',endDate:'2026-12-31',monthlyFee:0,username:'admin',password:STAFF_PASSWORD}});
 const company=created.companies[0];
 await act('owner',{type:'user.create',companyId:company.id,form:{username:'vendedor',role:'vendedor',password:STAFF_PASSWORD}});
 await login('admin',company.slug,'admin',STAFF_PASSWORD);await login('seller',company.slug,'vendedor',STAFF_PASSWORD);
 const body=await act('admin',{type:'business.change',payload:{kind:'producto',form:{nombre:'Última unidad',stock,precio_compra:1000,precio_venta:5000}}});
 return {store,company,call,product:body.state.prods[0]};
}
const lastUnitSale=product=>({type:'sale.create',form:{paymentMethod:'efectivo'},items:[{producto_id:product.id,cantidad:1,precio_unitario:5000}],labor:[]});

for(const withRevision of [false,true])test(`QA-03a: dos ventas concurrentes por la última unidad (SQLite real, revision ${withRevision?'enviada':'omitida'})`,async()=>{
 const directory=tempDir('scorta-qa-race-');let store;
 try{
  const shop=await sqliteShop(directory,1);store=shop.store;
  const revision=shop.store.readPrivate().businesses[shop.company.id].revision;
  const extra=withRevision?{revision}:{};
  const results=await Promise.all(['admin','seller'].map(who=>shop.call(who,'/api/v2/action',{...lastUnitSale(shop.product),...extra,requestId:crypto.randomUUID()})));
  const statuses=results.map(r=>r.status).sort();
  assert.equal(statuses.filter(s=>s===200).length,1,JSON.stringify(results.map(r=>r.body.error)));
  // Sin revision el segundo choca con el stock (400); con revision, con la versión (409).
  assert.deepEqual(statuses,withRevision?[200,409]:[200,400]);
  const business=shop.store.readPrivate().businesses[shop.company.id];
  assert.equal(business.prods[0].stock,0);assert.equal(business.ventas.length,1);
  assert.ok(business.prods.every(p=>p.stock>=0));
  assert.equal(business.movimientos.filter(m=>m.tipo==='venta'||m.cantidad<0).reduce((n,m)=>n+m.cantidad,0),-1);
 }finally{store?.close();rmSync(directory,{recursive:true,force:true})}
});

test('QA-03a: ráfaga de 8 ventas concurrentes con stock 3 nunca deja stock negativo',async()=>{
 const directory=tempDir('scorta-qa-burst-');let store;
 try{
  const shop=await sqliteShop(directory,3);store=shop.store;
  const results=await Promise.all(Array.from({length:8},(_,i)=>shop.call(i%2?'admin':'seller','/api/v2/action',{...lastUnitSale(shop.product),requestId:crypto.randomUUID()})));
  assert.equal(results.filter(r=>r.status===200).length,3);
  assert.ok(results.filter(r=>r.status!==200).every(r=>r.status===400));
  const business=shop.store.readPrivate().businesses[shop.company.id];
  assert.equal(business.prods[0].stock,0);assert.equal(business.ventas.length,3);
 }finally{store?.close();rmSync(directory,{recursive:true,force:true})}
});

// ---------------------------------------------------------------- (b)
test('QA-03b: matriz de aislamiento, ids de otra empresa se rechazan y su estado queda idéntico',async()=>{
 const f=await qaPlatform();const A=await f.shop('Taller Alfa'),B=await f.shop('Taller Beta');
 // Datos de B: una venta con servicio vinculado.
 const sold=await f.act(B.admin,{...f.saleBody(B.product),form:{paymentMethod:'efectivo',placa:'BET12A'},labor:[{descripcion:'Servicio Beta',importe:10000,mecanicoId:B.mechanic.id}]});
 const saleB=sold.state.ventas[0],serviceB=sold.state.servs.find(s=>s.venta_id===saleB.id);
 const snapshotB=()=>structuredClone({business:f.state.businesses[B.company.id],tickets:(f.state.supportTickets||[]).filter(t=>t.companyId===B.company.id),receipts:Object.values(f.state.receipts).filter(r=>r.companyId===B.company.id),users:f.state.users.filter(u=>u.companyId===B.company.id),company:f.state.companies.find(c=>c.id===B.company.id)});
 const snapshotA=()=>structuredClone({business:f.state.businesses[A.company.id],tickets:(f.state.supportTickets||[]).filter(t=>t.companyId===A.company.id)});
 const before=snapshotB();
 const cases=[
  ['sale.receipt (admin)',A.admin,{type:'sale.receipt',id:saleB.id},404],
  ['sale.receipt (vendedor)',A.seller,{type:'sale.receipt',id:saleB.id},404],
  ['sale.reverse',A.admin,{type:'sale.reverse',id:saleB.id,form:{motivo:'Ataque',parcial:false}},400],
  ['sale.reverse parcial',A.admin,{type:'sale.reverse',id:saleB.id,form:{motivo:'Ataque',parcial:true},items:[{index:0,cantidad:1}]},400],
  ['sale.create con producto ajeno',A.admin,{...f.saleBody(B.product),companyId:B.company.id},400],
  ['mechanic.update',A.admin,{type:'mechanic.update',id:B.mechanic.id,form:{name:'Renombrado',percentage:99}},404],
  ['mechanic.archive',A.admin,{type:'mechanic.archive',id:B.mechanic.id},404],
  ['ticket.reply (admin)',A.admin,{type:'ticket.reply',id:B.ticket.id,form:{message:'Intrusión'}},404],
  ['ticket.reply (vendedor)',A.seller,{type:'ticket.reply',id:B.ticket.id,form:{message:'Intrusión'}},404],
  ['ticket.read',A.admin,{type:'ticket.read',id:B.ticket.id},404],
  ['business.change ajuste',A.admin,{type:'business.change',payload:{kind:'ajuste',id:B.product.id,form:{stock:999,motivo:'Ataque'}}},400],
  ['business.change eliminar',A.admin,{type:'business.change',payload:{kind:'eliminar',id:B.product.id,form:{}}},400],
  ['business.change estado servicio',A.admin,{type:'business.change',payload:{kind:'estado',id:serviceB.id}},400],
  ['business.change reversión de servicio',A.admin,{type:'business.change',payload:{kind:'reversion',id:serviceB.id,form:{tipo:'servicio',motivo:'Ataque'}}},400],
 ];
 for(const [label,actor,body,status]of cases){
  const beforeA=snapshotA();
  const result=await f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
  assert.equal(result.status,status,`${label}: ${JSON.stringify(result.body)}`);
  assert.deepEqual(snapshotB(),before,`${label} modificó la empresa B`);
  assert.deepEqual(snapshotA(),beforeA,`${label} dejó cambios parciales en A`);
 }
 // business.change producto con id ajeno: el id desconocido se ignora y se crea un
 // producto NUEVO en A (comportamiento actual, aceptable); B no cambia.
 const pisado=await f.call(A.admin,'/api/v2/action',{requestId:crypto.randomUUID(),type:'business.change',payload:{kind:'producto',form:{id:B.product.id,nombre:'Pisado',precio_venta:1,precio_compra:1}}});
 ok(pisado);assert.ok(pisado.body.state.prods.every(p=>p.id!==B.product.id));
 assert.deepEqual(snapshotB(),before,'producto con id ajeno modificó B');
 // cash.close y lecturas: el contexto de empresa ajeno se rechaza antes de operar.
 for(const [label,path,body]of [['cash.close','/api/v2/action',{type:'cash.close',requestId:crypto.randomUUID(),form:{date:DAY_D,actual:{efectivo:0,transferencia:0,tarjeta:0}}}],['GET data',undefined,undefined],['GET reports','/api/v2/reports?from='+DAY_D+'&to='+DAY_D,undefined]]){
  const result=await f.call(A.admin,path,body,{expectedCompanyId:B.company.id,enforceContext:true});
  assert.equal(result.status,409,label);assert.equal(result.body.code,'COMPANY_CONTEXT_CHANGED');
  assert.equal(result.body.state,undefined,label+' filtró datos');
  assert.deepEqual(snapshotB(),before,label);
 }
 // cash.close con companyId ajeno en el cuerpo: se ignora y solo puede cerrar la caja propia.
 const closed=await f.act(A.admin,{type:'cash.close',companyId:B.company.id,form:{date:DAY_D,actual:{efectivo:0,transferencia:0,tarjeta:0}}});
 assert.equal(closed.state.cashClosures.length,1);
 assert.equal(f.state.businesses[A.company.id].cashClosures.length,1);
 assert.deepEqual(snapshotB(),before,'cash.close tocó la caja de B');
 // Las respuestas de A nunca incluyen documentos de B.
 const visible=JSON.stringify(await f.data(A.admin));
 for(const secret of [saleB.id,B.product.id,B.mechanic.id,B.ticket.id])assert.ok(!visible.includes(secret),secret);
});

// ---------------------------------------------------------------- (c)
test('QA-03c: devolución en D+1 de una venta de D ya cerrado conserva el cierre de D y cuadra D+1',async()=>{
 const f=await qaPlatform({now:AT_D});const S=await f.shop('Caja QA',{stock:10,price:34000});
 const sold=await f.act(S.seller,f.saleBody(S.product,{cantidad:2}));const saleD=sold.state.ventas[0];
 assert.equal(saleD.fecha,DAY_D);assert.equal(saleD.total,68000);
 const closeD=await f.act(S.admin,{type:'cash.close',form:{date:DAY_D,actual:{efectivo:68000,transferencia:0,tarjeta:0}}});
 const closureD=structuredClone(closeD.state.cashClosures.find(c=>c.date===DAY_D));
 assert.equal(closureD.totals.difference,0);
 f.setNow(AT_D1);
 await f.act(S.admin,{type:'sale.reverse',id:saleD.id,form:{motivo:'Cliente devuelve una unidad',parcial:true},items:[{index:0,cantidad:1}]});
 const after=await f.data(S.admin);
 assert.deepEqual(after.state.cashClosures.find(c=>c.date===DAY_D),closureD,'el registro del cierre de D no debe cambiar');
 assert.equal(after.state.prods[0].stock,9);
 // El REPORTE de ventas imputa la devolución a la fecha de la venta original (D);
 // la CAJA la descuenta el día en que se pagó (D+1, ver abajo).
 const reportD=await f.call(S.admin,'/api/v2/reports?from='+DAY_D+'&to='+DAY_D);ok(reportD);
 assert.equal(reportD.body.report.totals.returns,34000);assert.equal(reportD.body.report.paymentTotals.efectivo,34000);
 const reportD1=await f.call(S.admin,'/api/v2/reports?from='+DAY_D1+'&to='+DAY_D1);ok(reportD1);
 assert.equal(reportD1.body.report.totals.returns,0);
 // Un cierre ya registrado no se puede sobrescribir.
 const again=await f.call(S.admin,'/api/v2/action',{requestId:crypto.randomUUID(),type:'cash.close',form:{date:DAY_D,actual:{efectivo:34000,transferencia:0,tarjeta:0}}});
 assert.equal(again.status,409);assert.equal(again.body.code,'CASH_ALREADY_CLOSED');
 // D+1 (BE-15, corrige H-2026-11-21-01): la caja de D+1 abre con base 50.000 y la devolución
 // pagada en D+1 sale del esperado en efectivo de D+1. El reporte de ventas sigue en D.
 await f.act(S.admin,{type:'cash.open',form:{amount:50000}});
 await f.act(S.seller,f.saleBody(S.product,{paymentMethod:'transferencia'}));
 const closeD1=await f.act(S.admin,{type:'cash.close',form:{date:DAY_D1,actual:{efectivo:16000,transferencia:34000,tarjeta:0}}});
 const closureD1=closeD1.state.cashClosures.find(c=>c.date===DAY_D1);
 assert.deepEqual(closureD1.expected,{efectivo:16000,transferencia:34000,tarjeta:0});
 assert.equal(closureD1.breakdown.efectivo.devoluciones,34000);
 assert.equal(closureD1.totals.difference,0);
 assert.deepEqual(closeD1.state.cashClosures.find(c=>c.date===DAY_D),closureD);
});

// ---------------------------------------------------------------- (d)
test('QA-03d: restaurar un respaldo truncado, vacío, ajeno o con schemaVersion desconocido no toca el destino',async()=>{
 const directory=tempDir('scorta-qa-restore-');
 try{
  const source=join(directory,'valid.sqlite'),target=join(directory,'target.sqlite');
  const store=await openPlatformStore(source,{owner:OWNER});store.close();
  copyFileSync(source,target);
  const bytes=readFileSync(source);
  const truncated=join(directory,'truncated.sqlite');writeFileSync(truncated,bytes.subarray(0,Math.floor(bytes.length/2)));
  const headerOnly=join(directory,'header.sqlite');writeFileSync(headerOnly,bytes.subarray(0,100));
  const empty=join(directory,'empty.sqlite');writeFileSync(empty,'');
  const garbage=join(directory,'garbage.sqlite');writeFileSync(garbage,Buffer.from('esto no es una base de datos '.repeat(200)));
  const unknownSchema=join(directory,'schema99.sqlite');copyFileSync(source,unknownSchema);
  {const db=new DatabaseSync(unknownSchema);const state=JSON.parse(db.prepare('SELECT data FROM platform WHERE id=1').get().data);state.schemaVersion=99;db.prepare('UPDATE platform SET data=? WHERE id=1').run(JSON.stringify(state));db.close();}
  const noSchema=join(directory,'noschema.sqlite');copyFileSync(source,noSchema);
  {const db=new DatabaseSync(noSchema);const state=JSON.parse(db.prepare('SELECT data FROM platform WHERE id=1').get().data);delete state.schemaVersion;db.prepare('UPDATE platform SET data=? WHERE id=1').run(JSON.stringify(state));db.close();}
  const targetBefore=readFileSync(target);
  for(const bad of [truncated,headerOnly,empty,garbage,unknownSchema,noSchema]){
   const listing=readdirSync(directory).sort();
   assert.throws(()=>restorePlatformBackup(bad,target,{offline:true}),Error,bad);
   assert.deepEqual(readFileSync(target),targetBefore,'el destino cambió con '+bad);
   // Se toleran los -wal/-shm que SQLite crea junto al ORIGEN al validarlo; nunca junto al destino.
   const base=bad.split(/[\\/]/).pop();
   assert.deepEqual(readdirSync(directory).filter(n=>!n.startsWith(base+'-')).sort(),listing,'quedaron archivos temporales con '+bad);
   assert.ok(!readdirSync(directory).some(n=>n.startsWith('target.sqlite')&&n!=='target.sqlite'),'sidecars junto al destino');
  }
  // Control positivo: el respaldo válido sí se restaura.
  const restored=restorePlatformBackup(source,target,{offline:true});
  assert.ok(restored.previous);rmSync(restored.previous,{force:true});
 }finally{rmSync(directory,{recursive:true,force:true})}
});

// ---------------------------------------------------------------- (e)
// Dominio: moneyAmount limita los importes a 1e12. Por encima de ~9e13, Number(centavos)/100
// pierde precisión (roundMoney(1e21) devuelve 999999999999999900000); queda fuera de alcance.
// Referencia independiente: aritmética decimal exacta con BigInt sobre la
// representación decimal más corta del número (la que ve el usuario), media
// hacia arriba alejándose de cero.
function referenceCents(value){
 const n=Number(value);if(!Number.isFinite(n))throw Error('no finito');
 let [mantissa,exponent='0']=String(n).toLowerCase().split('e');
 const negative=mantissa.startsWith('-');if(negative)mantissa=mantissa.slice(1);
 const [whole,fraction='']=mantissa.split('.');
 const digits=BigInt(whole+fraction),scale=fraction.length-Number(exponent); // value = digits*10^-scale
 const SCALE=40;const scaled=digits*10n**BigInt(SCALE-scale); // value*10^SCALE
 const unit=10n**BigInt(SCALE-2);let cents=scaled/unit;if((scaled%unit)*2n>=unit)cents+=1n;
 return negative?-cents:cents;
}
const referenceRound=value=>{const c=referenceCents(value);return Number(c)/100};
const referenceSum=values=>Number(values.reduce((t,v)=>t+referenceCents(v),0n))/100;

test('QA-03e: roundMoney y sumMoney coinciden con una referencia BigInt en valores extremos',()=>{
 const cases=[[0,0],[1.005,1.01],[-1.005,-1.01],[2.675,2.68],[1.004999,1],[0.015,0.02],[-0.015,-0.02],[0.005,0.01],[-0.004,0],[1e12,1e12],[1e12+0.005,1e12+0.01],[999999999999.995,1e12],
[1.5e-7,0],[5e-3,0.01],[1.2345e2,123.45],[1.23455e2,123.46],[-1.23455e2,-123.46],['33.335',33.34],[33.33,33.33],[100/3,33.33],[200/3,66.67],[-200/3,-66.67],[0.1+0.2,0.3],[1.1*3,3.3]];
 for(const [input,expected]of cases){
  assert.equal(roundMoney(input),expected,'roundMoney('+input+')');
  assert.equal(roundMoney(input),referenceRound(input),'referencia '+input);
 }
 for(const bad of [NaN,Infinity,-Infinity,'abc',undefined])assert.throws(()=>roundMoney(bad));
 // Repartos del 33,33 %: tres partes redondeadas y el residuo cuadran al centavo.
 for(const total of [100,1000,99999.99,1e12,0.01,0.02,1234567.89]){
  const part=roundMoney(total*0.3333),parts=[part,part,roundMoney(total-part*2)];
  assert.equal(sumMoney(parts),referenceSum(parts));assert.equal(sumMoney(parts),roundMoney(total));
  const thirds=[total/3,total/3,total/3].map(roundMoney);assert.equal(sumMoney(thirds),referenceSum(thirds));
  assert.ok(Math.abs(Math.round(sumMoney(thirds)*100)-Math.round(total*100))<=1,'reparto en tercios de '+total);
 }
 assert.equal(sumMoney([0.1,0.2]),0.3);assert.equal(sumMoney([1e12,1e12,-1e12]),1e12);assert.equal(sumMoney([-1.005,1.005]),0);assert.equal(sumMoney([]),0);
 assert.equal(sumMoney(Array(1000).fill(0.01)),10);assert.equal(sumMoney(Array(3).fill(33.33)),99.99);
 // Fuzz determinista (LCG) contra la referencia, incluyendo negativos y 3-6 decimales.
 let seed=20261121;const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
 const values=[];
 for(let i=0;i<5000;i++){const decimals=Math.floor(rand()*7),magnitude=10**Math.floor(rand()*13);const v=Number(((rand()-0.3)*magnitude).toFixed(decimals));values.push(v);assert.equal(roundMoney(v),referenceRound(v),'fuzz '+v)}
 for(let i=0;i<values.length;i+=50){const chunk=values.slice(i,i+50);assert.equal(sumMoney(chunk),referenceSum(chunk))}
});

// ---------------------------------------------------------------- (f)
test('QA-03f: un vendedor no puede renovar el comprobante de una venta ajena (403) y el enlace queda igual',async()=>{
 const f=await qaPlatform();const S=await f.shop('Permisos QA',{stock:10});
 const other=(await f.act(S.seller2,f.saleBody(S.product))).state.ventas[0];
 const adminSale=(await f.act(S.admin,f.saleBody(S.product))).state.ventas[0];
 for(const target of [other,adminSale]){
  const before=structuredClone({sale:f.state.businesses[S.company.id].ventas.find(s=>s.id===target.id),receipts:f.state.receipts});
  const result=await f.call(S.seller,'/api/v2/action',{requestId:crypto.randomUUID(),type:'sale.receipt',id:target.id});
  assert.equal(result.status,403,JSON.stringify(result.body));assert.equal(result.body.code,'FORBIDDEN');
  assert.deepEqual({sale:f.state.businesses[S.company.id].ventas.find(s=>s.id===target.id),receipts:f.state.receipts},before);
 }
 // Controles positivos: el dueño de la venta y el administrador sí pueden renovar.
 // (Se compara la referencia guardada, no receiptToken: otro agente está dejando de guardar el secreto en la venta.)
 const links=()=>Object.entries(f.state.receipts).filter(([,r])=>r.saleId===other.id).map(([key])=>key);
 const initial=links();assert.equal(initial.length,1);
 const own=await f.call(S.seller2,'/api/v2/action',{requestId:crypto.randomUUID(),type:'sale.receipt',id:other.id});ok(own);
 const renewed=links();assert.equal(renewed.length,1);assert.notEqual(renewed[0],initial[0]);
 const byAdmin=await f.call(S.admin,'/api/v2/action',{requestId:crypto.randomUUID(),type:'sale.receipt',id:other.id});ok(byAdmin);
 assert.notEqual(links()[0],renewed[0]);
});
