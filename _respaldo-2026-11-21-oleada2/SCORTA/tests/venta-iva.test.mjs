// BE-18: IVA configurable por empresa, tarifa por producto y desglose en comprobante y reportes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,DAY_D} from './qa-fixture.mjs';
import {vatOf,vatBreakdown,listPrice,saleSettings,saleVat} from '../sale-pricing.mjs';
import {salesReport} from '../admin-reports.mjs';
import {overviewReport} from '../overview-report.mjs';
import {receiptMarkup} from '../src/receipt-ticket.mjs';

const action=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
const nbsp=value=>value.replace(/ /g,' ');

test('cálculo: IVA incluido por tarifa con redondeo a centavos',()=>{
  assert.deepEqual(vatOf(11900,19),{base:10000,iva:1900});
  assert.deepEqual(vatOf(10000,19),{base:8403.36,iva:1596.64});
  assert.deepEqual(vatOf(10500,5),{base:10000,iva:500});
  assert.deepEqual(vatOf(5000,0),{base:5000,iva:0});
  const breakdown=vatBreakdown([{tarifa:19,total:11900},{tarifa:19,total:11900},{tarifa:5,total:10500},{tarifa:0,total:2000},{tarifa:null,total:999}]);
  assert.deepEqual(breakdown.rows.map(row=>[row.tarifa,row.base,row.iva]),[[0,2000,0],[5,10000,500],[19,20000,3800]]);
  assert.equal(breakdown.iva,4300);assert.equal(breakdown.total,36300);
  const settings=saleSettings({settings:{vat:{enabled:true,defaultRate:19,pricesIncludeVat:false}}});
  assert.equal(listPrice({precio_venta:10000},'mostrador',settings),11900);
  assert.equal(listPrice({precio_venta:10000,tarifa_iva:5},'mostrador',settings),10500);
  assert.equal(listPrice({precio_venta:10000},'mostrador',saleSettings({})),10000);
  assert.equal(saleVat({total:1}),null);
});

test('API: con IVA desactivado (por defecto) la venta no cambia',async()=>{
  const f=await qaPlatform(),S=await f.shop('Sin IVA',{stock:5,price:11900});
  const body=await f.act(S.seller,f.saleBody(S.product));
  const record=body.state.ventas[0];assert.equal(record.iva,undefined);assert.equal(record.detalles[0].tarifa_iva,undefined);assert.equal(record.total,11900);
  assert.equal(salesReport(f.state.businesses[S.company.id],{from:DAY_D,to:DAY_D}).totals.vat,0);
  assert.doesNotMatch(receiptMarkup({sale:record,company:{name:'Moto QA'}}),/Base IVA|Total IVA|IVA [0-9]/);
});

test('API: IVA incluido por tarifa en venta, comprobante, reportes y utilidad sin IVA',async()=>{
  const f=await qaPlatform(),S=await f.shop('Con IVA',{stock:10,price:11900});
  let r=await action(f,S.admin,{type:'settings.update',form:{vat:{enabled:true,defaultRate:7}}});assert.equal(r.status,400);assert.match(r.body.error,/0, 5 o 19/);
  ok(await action(f,S.admin,{type:'settings.update',form:{vat:{enabled:true,defaultRate:19,pricesIncludeVat:true}}}));
  // Segundo producto exento (tarifa 0) creado con su tarifa.
  r=await action(f,S.admin,{type:'business.change',payload:{kind:'producto',form:{nombre:'Repuesto exento',categoria:'QA',stock:5,stock_minimo:1,precio_compra:1000,precio_venta:2000,tarifa_iva:0}}});ok(r);
  const exempt=r.body.state.prods.find(p=>p.nombre==='Repuesto exento');assert.equal(exempt.tarifa_iva,0);
  r=await action(f,S.admin,{type:'business.change',payload:{kind:'producto',form:{nombre:'Tarifa mala',categoria:'QA',stock:1,precio_venta:1000,tarifa_iva:16}}});assert.equal(r.status,400);
  const body=await f.act(S.admin,{type:'sale.create',form:{cliente:'IVA QA',paymentMethod:'efectivo',fecha:DAY_D,placa:'ABC12D'},items:[{producto_id:S.product.id,cantidad:2,precio_unitario:11900},{producto_id:exempt.id,cantidad:1,precio_unitario:2000}],labor:[{descripcion:'Mano de obra QA',mecanico:S.mechanic.name,mecanicoId:S.mechanic.id,importe:5950}]});
  const record=body.state.ventas[0];
  assert.deepEqual(record.detalles.map(line=>line.tarifa_iva),[19,0]);
  assert.equal(record.total,31750);assert.equal(record.iva.total,4750);
  assert.deepEqual(record.iva.tarifas.map(row=>[row.tarifa,row.base,row.iva]),[[0,2000,0],[19,25000,4750]]);
  const html=nbsp(receiptMarkup({sale:record,company:{name:'Con IVA'}}));
  for(const text of ['Base IVA 19 %','$ 25.000','IVA 19 %','$ 4.750','Base IVA 0 %','Total IVA'])assert.ok(html.includes(text),text);
  const business=f.state.businesses[S.company.id],report=salesReport(business,{from:DAY_D,to:DAY_D});
  assert.equal(report.totals.vat,4750);
  // Utilidad en productos: (23800 - 3800 IVA) - 40000 de costo + (2000 - 1000) = -19000.
  assert.equal(report.totals.productVat,3800);assert.equal(report.totals.productMargin,-19000);
  assert.equal(overviewReport(business,{from:DAY_D,to:DAY_D}).totals.vat,4750);
  // Devolución de una unidad: el IVA vigente baja.
  ok(await action(f,S.admin,{type:'sale.reverse',id:record.id,form:{motivo:'Devolución IVA',parcial:true},items:[{index:0,cantidad:1}]}));
  assert.equal(salesReport(f.state.businesses[S.company.id],{from:DAY_D,to:DAY_D}).totals.vat,2850);
});

test('API: precios sin IVA en el inventario suman la tarifa al vender (vendedor sin descuento)',async()=>{
  const f=await qaPlatform(),S=await f.shop('IVA aparte',{stock:5,price:10000});
  ok(await action(f,S.admin,{type:'settings.update',form:{vat:{enabled:true,defaultRate:19,pricesIncludeVat:false}}}));
  let r=await action(f,S.seller,f.saleBody(S.product,{precio:10000}));assert.equal(r.status,403,'el precio sin IVA ya no es el precio de lista');
  const body=await f.act(S.seller,f.saleBody(S.product,{precio:11900}));
  const record=body.state.ventas[0];assert.equal(record.total,11900);assert.equal(record.detalles[0].precio_lista,11900);assert.equal(record.detalles[0].descuento,0);assert.equal(record.iva.total,1900);
  assert.equal(record.iva.preciosCatalogoConIva,false);
});
