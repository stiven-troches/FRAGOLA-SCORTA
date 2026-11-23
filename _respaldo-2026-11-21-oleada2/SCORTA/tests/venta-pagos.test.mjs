// FE-06: pago dividido, Nequi y Daviplata, vueltas y cierre de caja por los cinco medios.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,DAY_D} from './qa-fixture.mjs';
import {normalizePayments,primaryMethod,allocatePayments,salePayments,cashChange,PAYMENT_KEYS} from '../sale-pricing.mjs';
import {salesReport,cashExpected,reportCSV} from '../admin-reports.mjs';
import {receiptMarkup} from '../src/receipt-ticket.mjs';

const action=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
const sale=(product,form={},cantidad=1)=>({type:'sale.create',form:{cliente:'Cliente QA',paymentMethod:'efectivo',...form},items:[{producto_id:product.id,cantidad,precio_unitario:product.precio_venta}],labor:[]});
const nbsp=value=>value.replace(/ /g,' ');

test('cálculo: pagos válidos, medio principal, reparto proporcional y vueltas',()=>{
  assert.deepEqual(PAYMENT_KEYS,['efectivo','transferencia','tarjeta','nequi','daviplata']);
  assert.deepEqual(normalizePayments([{method:'efectivo',amount:'10000'},{method:'nequi',amount:24000},{method:'efectivo',amount:0}],34000),[{method:'efectivo',amount:10000},{method:'nequi',amount:24000}]);
  assert.throws(()=>normalizePayments([{method:'efectivo',amount:10000}],34000),/suman 10000 y el total de la venta es 34000/);
  assert.throws(()=>normalizePayments([{method:'bitcoin',amount:34000}],34000),/Nequi o Daviplata/);
  assert.throws(()=>normalizePayments(Array.from({length:6},()=>({method:'efectivo',amount:1})),6),/entre 1 y 5/);
  assert.equal(primaryMethod([{method:'efectivo',amount:10000},{method:'nequi',amount:24000}]),'nequi');
  assert.equal(primaryMethod([{method:'tarjeta',amount:5},{method:'daviplata',amount:5}]),'tarjeta');
  assert.deepEqual(salePayments({paymentMethod:'tarjeta',total:5000}),[{method:'tarjeta',amount:5000}]);
  assert.deepEqual(salePayments({paymentMethod:'',total:5000}),[]);
  const split={payments:[{method:'efectivo',amount:10000},{method:'nequi',amount:20000},{method:'tarjeta',amount:3333.33}],total:33333.33};
  const allocated=allocatePayments(split,16666.67);assert.equal(Object.values(allocated).reduce((n,v)=>Math.round((n+v)*100)/100,0),16666.67);assert.equal(allocated.efectivo,5000);
  assert.deepEqual(allocatePayments({paymentMethod:'efectivo',total:100},60),{efectivo:60});
  assert.equal(cashChange('50000',40000),10000);assert.equal(cashChange('',40000),null);
});

test('API: venta con pago dividido guarda payments, paymentMethod principal y vueltas; suma distinta da 400',async()=>{
  const f=await qaPlatform(),S=await f.shop('Pagos QA',{stock:10,price:34000});
  const before=structuredClone(f.state.businesses[S.company.id]);
  let r=await action(f,S.seller,sale(S.product,{payments:[{method:'efectivo',amount:10000},{method:'nequi',amount:20000}]}));
  assert.equal(r.status,400);assert.equal(r.body.code,'PAYMENT_MISMATCH');
  r=await action(f,S.seller,sale(S.product,{paymentMethod:'cheque'}));assert.equal(r.status,400);assert.match(r.body.error,/Nequi o Daviplata/);
  r=await action(f,S.seller,sale(S.product,{payments:[{method:'efectivo',amount:10000},{method:'nequi',amount:24000}],efectivo_recibido:5000}));assert.equal(r.status,400);assert.match(r.body.error,/efectivo recibido es menor/);
  assert.deepEqual(f.state.businesses[S.company.id],before);
  const body=await f.act(S.seller,sale(S.product,{paymentMethod:'efectivo',payments:[{method:'efectivo',amount:10000},{method:'nequi',amount:24000}],efectivo_recibido:20000}));
  const record=body.state.ventas[0];
  assert.deepEqual(record.payments,[{method:'efectivo',amount:10000},{method:'nequi',amount:24000}]);
  assert.equal(record.paymentMethod,'nequi');assert.equal(record.efectivo_recibido,20000);assert.equal(record.vueltas,10000);
  // Un solo medio nuevo (Daviplata) sin payments explícitos.
  const davi=await f.act(S.seller,sale(S.product,{paymentMethod:'daviplata'}));
  assert.deepEqual(davi.state.ventas[0].payments,[{method:'daviplata',amount:34000}]);
  // El comprobante muestra el desglose de pagos y las vueltas.
  const html=nbsp(receiptMarkup({sale:record,company:{name:'Pagos QA'}}));
  for(const text of ['Pagos','Efectivo','$ 10.000','Nequi','$ 24.000','Efectivo recibido','$ 20.000','Vueltas'])assert.ok(html.includes(text),text);
  const single=nbsp(receiptMarkup({sale:davi.state.ventas[0],company:{name:'Pagos QA'}}));assert.ok(single.includes('Daviplata'));assert.ok(!single.includes('Vueltas'));
});

test('cierre: concilia los cinco medios; ventas antiguas sin payments cuentan con su paymentMethod',async()=>{
  const f=await qaPlatform(),S=await f.shop('Caja QA',{stock:20,price:34000});
  ok(await action(f,S.seller,sale(S.product,{payments:[{method:'efectivo',amount:10000},{method:'nequi',amount:24000}]})));
  ok(await action(f,S.seller,sale(S.product,{paymentMethod:'tarjeta'})));
  // Venta antigua: sin payments en el estado (datos previos a FE-06).
  ok(await action(f,S.admin,sale(S.product,{paymentMethod:'transferencia'})));
  const business=f.state.businesses[S.company.id];delete business.ventas[0].payments;
  const expected=cashExpected(business,DAY_D);
  assert.deepEqual(expected,{efectivo:10000,transferencia:34000,tarjeta:34000,nequi:24000});
  const report=salesReport(business,{from:DAY_D,to:DAY_D});assert.equal(report.unknownPaymentCount,0);
  assert.ok(report.rows.some(row=>row.paymentDetail==='Efectivo 10000 + Nequi 24000'));
  assert.ok(reportCSV('sales',report).includes('"Pagos"'));
  // Nequi esperado: si falta en lo recibido, el cierre se rechaza.
  let r=await action(f,S.admin,{type:'cash.close',form:{date:DAY_D,actual:{efectivo:10000,transferencia:34000,tarjeta:34000}}});
  assert.equal(r.status,400);assert.match(r.body.error,/Nequi/);
  r=await action(f,S.admin,{type:'cash.close',form:{date:DAY_D,actual:{efectivo:10000,transferencia:34000,tarjeta:34000,nequi:23000,daviplata:0}}});ok(r);
  const closure=r.body.state.cashClosures[0];
  assert.deepEqual(closure.expected,{efectivo:10000,transferencia:34000,tarjeta:34000,nequi:24000,daviplata:0});
  assert.deepEqual(closure.differences,{efectivo:0,transferencia:0,tarjeta:0,nequi:-1000,daviplata:0});
  assert.equal(closure.totals.difference,-1000);
});

test('cierre: devolución parcial de una venta dividida se reparte en proporción a lo pagado',async()=>{
  const f=await qaPlatform(),S=await f.shop('Devolución QA',{stock:20,price:34000});
  const body=await f.act(S.admin,sale(S.product,{payments:[{method:'efectivo',amount:17000},{method:'daviplata',amount:51000}]},2));
  ok(await action(f,S.admin,{type:'sale.reverse',id:body.state.ventas[0].id,form:{motivo:'Devuelve una unidad',parcial:true},items:[{index:0,cantidad:1}]}));
  assert.deepEqual(cashExpected(f.state.businesses[S.company.id],DAY_D),{efectivo:8500,transferencia:0,tarjeta:0,daviplata:25500});
});
