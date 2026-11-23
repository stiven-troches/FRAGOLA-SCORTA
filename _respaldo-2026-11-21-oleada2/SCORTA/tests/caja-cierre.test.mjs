// BE-15: cierre de caja completo (base, gastos, retiros, ingresos, abonos, devoluciones en D+1 y pagos divididos).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,AT_D,AT_D1,DAY_D,DAY_D1} from './qa-fixture.mjs';
import {cashBook,saleRefunds} from '../caja-credito.mjs';
import {cashExpected} from '../admin-reports.mjs';

const post=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
async function shopWithCard(f,name,{stock=20,limit=200000}={}){
 const S=await f.shop(name,{stock,price:34000});
 const body=await f.act(S.admin,{type:'customer.create',form:{nombre:'Taller '+name,telefono:'+573001110000',creditLimit:limit,creditDays:30}});
 return {...S,card:body.state.customerRecords.find(c=>c.nombre==='Taller '+name)};
}

test('caja: base, ventas divididas, gastos, retiros, ingresos y abonos cuadran por medio de pago',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await shopWithCard(f,'Caja Base');
 // Apertura: solo el administrador y una vez por día.
 assert.equal((await post(f,S.seller,{type:'cash.open',form:{amount:100000}})).status,403);
 await f.act(S.admin,{type:'cash.open',form:{amount:100000}});
 const twice=await post(f,S.admin,{type:'cash.open',form:{amount:5000}});assert.equal(twice.status,409);assert.equal(twice.body.code,'CASH_ALREADY_OPEN');
 // Venta con pago dividido: 50.000 en efectivo y 18.000 por Nequi.
 await f.act(S.seller,f.saleBody(S.product,{cantidad:2,form:{cliente:'Cliente QA',paymentMethod:'efectivo',payments:[{method:'efectivo',amount:50000},{method:'nequi',amount:18000}]}}));
 // Venta a crédito de 34.000 y un abono en efectivo de 20.000 el mismo día.
 await f.act(S.seller,f.saleBody(S.product,{form:{cliente:S.card.nombre,customerId:S.card.id,paymentMethod:'credito'}}));
 await f.act(S.seller,{type:'credit.payment',form:{customerId:S.card.id,amount:20000,method:'efectivo'}});
 // Gasto del vendedor dentro del tope (50.000 por defecto) y por encima del tope.
 const requestId=crypto.randomUUID();
 const first=await f.call(S.seller,'/api/v2/action',{requestId,type:'cash.expense',form:{amount:15000,motivo:'Almuerzo',method:'efectivo'}});ok(first);
 const repeated=await f.call(S.seller,'/api/v2/action',{requestId,type:'cash.expense',form:{amount:15000,motivo:'Almuerzo',method:'efectivo'}});ok(repeated);
 const over=await post(f,S.seller,{type:'cash.expense',form:{amount:60000,motivo:'Repuesto urgente'}});assert.equal(over.status,403);assert.equal(over.body.code,'EXPENSE_LIMIT');
 assert.equal((await post(f,S.seller,{type:'cash.expense',form:{amount:1000}})).status,400,'el gasto exige motivo');
 await f.act(S.admin,{type:'cash.expense',form:{amount:60000,motivo:'Repuesto urgente'}});
 // Retiro del dueño e ingreso que no es venta: solo administrador.
 assert.equal((await post(f,S.seller,{type:'cash.withdrawal',form:{amount:1000,motivo:'x'}})).status,403);
 assert.equal((await post(f,S.seller,{type:'cash.deposit',form:{amount:1000,motivo:'x'}})).status,403);
 await f.act(S.admin,{type:'cash.withdrawal',form:{amount:30000,motivo:'Retiro del dueño'}});
 await f.act(S.admin,{type:'cash.deposit',form:{amount:10000,motivo:'Préstamo del socio',method:'transferencia'}});
 const data=await f.data(S.admin);
 assert.equal(data.state.cashMovements.filter(m=>m.tipo==='gasto').length,2,'el requestId repetido no duplica el gasto');
 const book=cashBook(data.state,DAY_D);
 assert.deepEqual(book.rows.efectivo,{base:100000,ventas:50000,abonos:20000,separados:0,ingresos:0,gastos:75000,retiros:30000,devoluciones:0});
 assert.equal(book.expected.efectivo,65000);assert.equal(book.expected.nequi,18000);assert.equal(book.expected.transferencia,10000);
 assert.equal(book.creditSales,34000);assert.deepEqual(cashExpected(data.state,DAY_D),book.expected);
 // El vendedor solo ve sus propios movimientos de caja.
 const sellerView=await f.data(S.seller);assert.ok(sellerView.state.cashMovements.every(m=>m.userId===sellerView.session.userId));assert.equal(sellerView.state.cashClosures,undefined);
 const closed=await f.act(S.admin,{type:'cash.close',form:{date:DAY_D,actual:{efectivo:64000,transferencia:10000,tarjeta:0,nequi:18000}}});
 const record=closed.state.cashClosures[0];
 assert.equal(record.version,2);assert.equal(record.base,100000);assert.equal(record.baseSource,'apertura');
 assert.deepEqual(record.expected,{efectivo:65000,transferencia:10000,tarjeta:0,nequi:18000});
 assert.deepEqual(record.differences,{efectivo:-1000,transferencia:0,tarjeta:0,nequi:0});
 assert.equal(record.breakdown.efectivo.gastos,75000);assert.equal(record.breakdown.efectivo.esperado,65000);assert.equal(record.creditSales,34000);
 // Con la caja cerrada no se registran más movimientos ese día.
 const late=await post(f,S.admin,{type:'cash.expense',form:{amount:1000,motivo:'Tarde'}});assert.equal(late.status,409);assert.equal(late.body.code,'CASH_ALREADY_CLOSED');
 const audit=(await f.data(S.admin)).state.auditoria.map(a=>a.accion);
 for(const action of ['caja_apertura','caja_gasto','caja_retiro','caja_ingreso','abono_credito'])assert.ok(audit.includes(action),action);
});

test('caja: la devolución pagada en D+1 sale de la caja de D+1 y el cierre de D no cambia (H-2026-11-21-01)',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Caja Devolucion',{stock:10,price:34000});
 const sold=await f.act(S.seller,f.saleBody(S.product,{cantidad:2}));const sale=sold.state.ventas[0];
 const closeD=await f.act(S.admin,{type:'cash.close',form:{date:DAY_D,actual:{efectivo:68000,transferencia:0,tarjeta:0}}});
 const closureD=structuredClone(closeD.state.cashClosures[0]);assert.equal(closureD.totals.difference,0);
 f.setNow(AT_D1);
 await f.act(S.admin,{type:'cash.open',form:{amount:50000}});
 await f.act(S.admin,{type:'sale.reverse',id:sale.id,form:{motivo:'Devuelve una unidad',parcial:true},items:[{index:0,cantidad:1}]});
 // Otra devolución, pagada por Nequi por decisión del administrador.
 const other=await f.act(S.seller,f.saleBody(S.product,{paymentMethod:'transferencia'}));
 await f.act(S.admin,{type:'sale.reverse',id:other.state.ventas[0].id,form:{motivo:'Garantía',refundMethod:'nequi'}});
 const data=await f.data(S.admin),reversed=data.state.ventas.find(s=>s.id===sale.id);
 assert.equal(reversed.reversiones[0].fechaComercial,DAY_D1);assert.deepEqual(reversed.reversiones[0].reembolso,{total:34000,credito:0,pagos:[{method:'efectivo',amount:34000}]});
 assert.deepEqual(data.state.cashClosures.find(c=>c.date===DAY_D),closureD,'el cierre de D es inmutable');
 assert.equal(cashBook(data.state,DAY_D).expected.efectivo,68000,'D conserva su venta');
 const book=cashBook(data.state,DAY_D1);
 assert.equal(book.rows.efectivo.devoluciones,34000);assert.equal(book.expected.efectivo,16000);
 assert.equal(book.expected.transferencia,34000);assert.equal(book.expected.nequi,-34000);
 const closeD1=await f.act(S.admin,{type:'cash.close',form:{date:DAY_D1,actual:{efectivo:16000,transferencia:34000,tarjeta:0,nequi:0}}});
 const closureD1=closeD1.state.cashClosures.find(c=>c.date===DAY_D1);
 assert.equal(closureD1.differences.efectivo,0);assert.equal(closureD1.differences.nequi,34000);assert.equal(closureD1.breakdown.efectivo.devoluciones,34000);
 // El reporte de ventas sigue imputando la devolución a la fecha de la venta original.
 const report=await f.call(S.admin,'/api/v2/reports?from='+DAY_D+'&to='+DAY_D);ok(report);assert.equal(report.body.report.totals.returns,34000);
 assert.equal((await post(f,S.admin,{type:'sale.reverse',id:sale.id,form:{motivo:'x',refundMethod:'bitcoin'}})).status,400);
});

test('caja: sin apertura el cierre indica la base; con apertura no se puede repetir',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Caja Sin Apertura',{stock:10,price:34000});
 await f.act(S.seller,f.saleBody(S.product));
 const closed=await f.act(S.admin,{type:'cash.close',form:{date:DAY_D,base:20000,actual:{efectivo:54000,transferencia:0,tarjeta:0}}});
 const record=closed.state.cashClosures[0];assert.equal(record.base,20000);assert.equal(record.baseSource,'cierre');assert.equal(record.expected.efectivo,54000);assert.equal(record.totals.difference,0);
 f.setNow(AT_D1);await f.act(S.admin,{type:'cash.open',form:{amount:10000}});
 const dup=await post(f,S.admin,{type:'cash.close',form:{date:DAY_D1,base:10000,actual:{efectivo:10000,transferencia:0,tarjeta:0}}});assert.equal(dup.status,409);assert.equal(dup.body.code,'CASH_ALREADY_OPEN');
});

test('caja: cierres y devoluciones anteriores a BE-15 se conservan y calculan igual',()=>{
 const legacyClosure={id:'c-old',date:'2026-10-01',expected:{efectivo:100,transferencia:0,tarjeta:0},actual:{efectivo:100,transferencia:0,tarjeta:0},differences:{efectivo:0,transferencia:0,tarjeta:0},totals:{expected:100,actual:100,difference:0}};
 const business={cashClosures:[legacyClosure],ventas:[
  // Devolución antigua sin reembolso registrado: se reconstruye y se descuenta en su día.
  {id:'v1',fecha:'2026-10-02',total:300,paymentMethod:'efectivo',detalles:[{producto_id:'p',cantidad:3,precio_unitario:100,devuelto:1}],reversiones:[{id:'r1',fecha:'2026-10-03T15:00:00.000Z',parcial:true,detalles:[{index:0,cantidad:1}]}]},
  // Venta anulada sin reversiones (datos muy antiguos): regla anterior, neto 0 en su fecha.
  {id:'v2',fecha:'2026-10-02',total:500,paymentMethod:'tarjeta',anulada:true,detalles:[]}]};
 assert.equal(cashBook(business,'2026-10-02').expected.efectivo,300);assert.equal(cashBook(business,'2026-10-02').expected.tarjeta,0);
 assert.equal(cashBook(business,'2026-10-03').expected.efectivo,-100);
 assert.deepEqual(saleRefunds(business.ventas[0]).map(r=>[r.fecha,r.total]),[['2026-10-03',100]]);
 assert.deepEqual(business.cashClosures[0],legacyClosure);
});

test('caja: aislamiento entre empresas y vendedor sin gastos por encima del tope configurado',async()=>{
 const f=await qaPlatform({now:AT_D}),A=await f.shop('Caja Uno'),B=await f.shop('Caja Dos');
 await f.act(A.admin,{type:'settings.update',form:{caja:{maxSellerExpense:5000}}});
 assert.equal((await post(f,A.seller,{type:'cash.expense',form:{amount:6000,motivo:'Taxi'}})).status,403);
 await f.act(A.seller,{type:'cash.expense',form:{amount:5000,motivo:'Taxi'}});
 await f.act(B.seller,{type:'cash.expense',form:{amount:6000,motivo:'Taxi'}});
 const a=await f.data(A.admin),b=await f.data(B.admin);
 assert.equal(a.state.cashMovements.length,1);assert.equal(b.state.cashMovements.length,1);assert.equal(b.state.cashMovements[0].amount,6000);
 const bad=await post(f,B.admin,{type:'cash.expense',form:{amount:-1,motivo:'x'}});assert.equal(bad.status,400);
});
