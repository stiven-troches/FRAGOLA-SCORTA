// BE-16: ventas a crédito, cupo por cliente, abonos de la factura más antigua a la más nueva, cartera y reportes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,AT_D,AT_D1,DAY_D,DAY_D1} from './qa-fixture.mjs';
import {creditAccounts,portfolioSummary,cashBook,whatsappLink} from '../caja-credito.mjs';
import {portfolioReport,creditPaymentReport,salesReport,reportColumns,reportCSV} from '../admin-reports.mjs';
import {overviewReport} from '../overview-report.mjs';

const post=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
const creditSale=(S,card,{cantidad=1,payments,paymentMethod='credito'}={})=>({type:'sale.create',form:{cliente:card.nombre,customerId:card.id,paymentMethod,...(payments?{payments}:{})},items:[{producto_id:S.product.id,cantidad,precio_unitario:S.product.precio_venta}],labor:[]});
async function setup(name,{limit=100000,stock=30}={}){
 const f=await qaPlatform({now:AT_D}),S=await f.shop(name,{stock,price:34000});
 // Solo el administrador asigna cupos.
 assert.equal((await post(f,S.seller,{type:'customer.create',form:{nombre:'Taller '+name,creditLimit:limit}})).status,403);
 const body=await f.act(S.admin,{type:'customer.create',form:{nombre:'Taller '+name,telefono:'3001234567',creditLimit:limit,creditDays:15}});
 return {f,S,card:body.state.customerRecords.find(c=>c.nombre==='Taller '+name)};
}

test('crédito: cupo, venta mixta contado/crédito, 403 al vendedor y advertencia al administrador',async()=>{
 const {f,S,card}=await setup('Credito Cupo');
 assert.equal(card.creditLimit,100000);assert.equal(card.creditDays,15);
 // Sin ficha no hay crédito.
 const anonymous=await post(f,S.seller,{type:'sale.create',form:{cliente:'Sin ficha',paymentMethod:'credito'},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:34000}],labor:[]});
 assert.equal(anonymous.status,400);assert.equal(anonymous.body.code,'CUSTOMER_REQUIRED');
 // Mixta: 20.000 de contado y 48.000 a crédito.
 const mixed=await f.act(S.seller,creditSale(S,card,{cantidad:2,payments:[{method:'efectivo',amount:20000},{method:'credito',amount:48000}]}));
 const sale=mixed.state.ventas[0];
 assert.deepEqual(sale.credito,{monto:48000,saldo:48000,pagado:0,plazoDias:15,vence:'2026-12-04'});assert.equal(sale.paymentMethod,'credito');
 // 48.000 + 68.000 supera el cupo de 100.000.
 const over=await post(f,S.seller,creditSale(S,card,{cantidad:2}));assert.equal(over.status,403);assert.equal(over.body.code,'CREDIT_LIMIT');assert.match(over.body.error,/supera el cupo/);
 const allowed=await f.call(S.admin,'/api/v2/action',{requestId:crypto.randomUUID(),...creditSale(S,card,{cantidad:2})});ok(allowed);
 assert.match(allowed.body.warning,/supera el cupo/);assert.ok(allowed.body.state.auditoria.some(a=>a.accion==='credito_sobre_cupo'));
 const account=allowed.body.state.creditAccounts.find(a=>a.customerId===card.id);
 assert.equal(account.saldo,116000);assert.equal(account.disponible,0);assert.equal(account.facturas.length,2);
 const directory=allowed.body.state.customerDirectory.find(c=>c.id===card.id);assert.equal(directory.creditLimit,100000);
 // El administrador cambia el cupo; queda en la auditoría.
 const updated=await f.act(S.admin,{type:'customer.update',id:card.id,form:{creditLimit:200000,creditDays:''}});
 const record=updated.state.customerRecords.find(c=>c.id===card.id);assert.equal(record.creditLimit,200000);assert.equal(record.creditDays,undefined);
 assert.ok(updated.state.auditoria.some(a=>a.accion==='cliente_corregido'&&a.antes.cupo===100000&&a.despues.cupo===200000));
 // Utilidad por causación: la venta a crédito cuenta el día de la venta.
 const overview=overviewReport(updated.state,{from:DAY_D,to:DAY_D});assert.equal(overview.totals.net,sumOf(updated.state.ventas));
 const report=salesReport(updated.state,{from:DAY_D,to:DAY_D});assert.equal(report.credit.sales,116000);assert.equal(report.paymentTotals.credito,116000);assert.equal(report.unknownPaymentCount,0);
});
const sumOf=sales=>sales.reduce((n,s)=>n+s.total,0);

test('crédito: un abono paga varias facturas de la más antigua a la más nueva y entra a la caja del día',async()=>{
 const {f,S,card}=await setup('Credito Abonos',{limit:500000});
 await f.act(S.seller,creditSale(S,card));                       // D: 34.000
 f.setNow(AT_D1);
 await f.act(S.seller,creditSale(S,card,{cantidad:2}));          // D+1: 68.000
 await f.act(S.seller,creditSale(S,card));                       // D+1: 34.000
 const tooMuch=await post(f,S.seller,{type:'credit.payment',form:{customerId:card.id,amount:136001,method:'efectivo'}});assert.equal(tooMuch.status,400);assert.equal(tooMuch.body.code,'PAYMENT_EXCEEDS_BALANCE');
 const paid=await f.act(S.seller,{type:'credit.payment',form:{customerId:card.id,amount:80000,method:'nequi'}});
 assert.equal(paid.document.kind,'abono');
 const data=await f.data(S.admin),payment=data.state.creditPayments[0];
 assert.equal(payment.numero,'AB-0001');assert.equal(payment.saldoAntes,136000);assert.equal(payment.saldoDespues,56000);
 assert.deepEqual(payment.aplicado.map(a=>[a.fecha,a.amount,a.saldoDespues]),[[DAY_D,34000,0],[DAY_D1,46000,22000]]);
 const account=data.state.creditAccounts.find(a=>a.customerId===card.id);
 assert.equal(account.saldo,56000);assert.deepEqual(account.facturas.map(x=>x.saldo),[0,22000,34000]);
 assert.equal(cashBook(data.state,DAY_D1).rows.nequi.abonos,80000);assert.equal(cashBook(data.state,DAY_D1).expected.nequi,80000);
 const report=creditPaymentReport(data.state,{from:DAY_D1,to:DAY_D1});assert.equal(report.totals.amount,80000);assert.equal(report.rows[0].invoices,2);
 assert.equal(salesReport(data.state,{from:DAY_D,to:DAY_D1}).credit.payments,80000);
 // El vendedor ve la cartera completa para cobrar, pero no los abonos de otros usuarios.
 const seller2=await f.data(S.seller2);assert.equal(seller2.state.creditAccounts.find(a=>a.customerId===card.id).saldo,56000);assert.equal(seller2.state.creditPayments.length,0);
 const none=await post(f,S.seller,{type:'credit.payment',form:{customerId:'no-existe',amount:1,method:'efectivo'}});assert.equal(none.status,404);
});

test('crédito: devolver una venta a crédito reduce el saldo antes de reembolsar',async()=>{
 const {f,S,card}=await setup('Credito Devolucion',{limit:500000});
 const sold=await f.act(S.seller,creditSale(S,card,{cantidad:3,payments:[{method:'efectivo',amount:30000},{method:'credito',amount:72000}]}));
 const sale=sold.state.ventas[0];
 await f.act(S.seller,{type:'credit.payment',form:{customerId:card.id,amount:50000,method:'efectivo'}});
 // Devuelve 1 unidad (34.000): todo sale del saldo pendiente (22.000) y el resto (12.000) se reembolsa.
 const partial=await f.act(S.admin,{type:'sale.reverse',id:sale.id,form:{motivo:'Una unidad no sirve',parcial:true},items:[{index:0,cantidad:1}]});
 let current=partial.state.ventas.find(s=>s.id===sale.id);
 assert.deepEqual(current.reversiones[0].reembolso,{total:34000,credito:22000,pagos:[{method:'efectivo',amount:12000}]});assert.equal(current.credito.saldo,0);
 // Vendedor no puede anular.
 assert.equal((await post(f,S.seller,{type:'sale.reverse',id:sale.id,form:{motivo:'x'}})).status,403);
 const full=await f.act(S.admin,{type:'sale.reverse',id:sale.id,form:{motivo:'Anulación'}});
 current=full.state.ventas.find(s=>s.id===sale.id);assert.equal(current.reversiones[1].reembolso.total,68000);assert.equal(current.reversiones[1].reembolso.credito,0);
 const book=cashBook(full.state,DAY_D);assert.equal(book.rows.efectivo.devoluciones,80000);assert.equal(book.expected.efectivo,30000+50000-80000);
 assert.equal(full.state.creditAccounts.find(a=>a.customerId===card.id).saldo,0);
});

test('cartera: antigüedad 0-30, 31-60, 61-90 y +90, vencidos, Excel y WhatsApp',()=>{
 const today='2026-11-21',sale=(id,fecha,saldo,vence)=>({id,fecha,customerId:'c1',cliente:'Taller',total:saldo,credito:{monto:saldo,saldo,vence}});
 const business={customerRecords:[{id:'c1',nombre:'Taller Uno',telefono:'3001234567',creditLimit:500000},{id:'c2',nombre:'Sin deuda',creditLimit:10000}],
  ventas:[sale('a','2026-11-10',1000,'2026-12-10'),sale('b','2026-10-01',2000,'2026-10-31'),sale('c','2026-09-01',3000,'2026-10-01'),sale('d','2026-07-01',4000,'2026-07-31'),{...sale('e','2026-07-01',9000,'2026-07-31'),anulada:true}]};
 const [account]=creditAccounts(business,today);
 assert.equal(account.nombre,'Taller Uno');assert.equal(account.saldo,10000);assert.equal(account.vencido,9000);
 assert.deepEqual(account.antiguedad,{'0-30':1000,'31-60':2000,'61-90':3000,'+90':4000});
 const summary=portfolioSummary(creditAccounts(business,today));assert.equal(summary.clientes,1);assert.equal(summary.saldo,10000);assert.equal(summary.clientesVencidos,1);
 const report=portfolioReport(business,today);assert.equal(report.rows.length,1);assert.equal(report.rows[0].b90,4000);assert.equal(report.rows[0].oldest,'2026-07-01');
 assert.ok(reportColumns('portfolio').some(([key])=>key==='overdue'));assert.match(reportCSV('portfolio',report),/Taller Uno/);
 assert.equal(whatsappLink('3001234567','Hola'),'https://wa.me/573001234567?text=Hola');assert.equal(whatsappLink('123','x'),'');
});
