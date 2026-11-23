// BE-04: descuentos por línea y al total, precio editable por el administrador y tope del vendedor.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,DAY_D} from './qa-fixture.mjs';
import {priceLines,sellerDiscountLimit,discountPercent,normalizeDiscount,saleSettings,cleanSaleSettings} from '../sale-pricing.mjs';
import {salesReport} from '../admin-reports.mjs';
import {overviewReport} from '../overview-report.mjs';

const action=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
const sale=(product,{items,form={}}={})=>({type:'sale.create',form:{cliente:'Cliente QA',paymentMethod:'efectivo',...form},items:items||[{producto_id:product.id,cantidad:1,precio_unitario:product.precio_venta}],labor:[]});

test('cálculo: descuento por unidad en valor o %, reparto del descuento al total y redondeo a centavos',()=>{
  const r=priceLines([{precio:10000,cantidad:2,descuento:{tipo:'porcentaje',valor:10}},{precio:5000,cantidad:1,descuento:{tipo:'valor',valor:500}}]);
  assert.deepEqual(r.lines.map(l=>l.precio_unitario),[9000,4500]);
  assert.equal(r.bruto,25000);assert.equal(r.subtotal,22500);assert.equal(r.descuentos,2500);assert.equal(r.descuentoLineas,2500);assert.equal(r.descuentoTotal,0);
  const total=priceLines([{precio:10000,cantidad:1},{precio:3333.33,cantidad:3}],{tipo:'porcentaje',valor:10});
  assert.deepEqual(total.lines.map(l=>l.precio_unitario),[9000,3000]);assert.equal(total.descuentoTotal,1999.99);assert.equal(total.subtotal,18000);
  const value=priceLines([{precio:6000,cantidad:1},{precio:4000,cantidad:1}],{tipo:'valor',valor:1000});
  assert.deepEqual(value.lines.map(l=>l.precio_unitario),[5400,3600]);assert.equal(value.descuentoTotal,1000);
  assert.throws(()=>priceLines([{precio:1000,cantidad:1,descuento:{tipo:'valor',valor:1500}}]),/no puede superar el precio/);
  assert.throws(()=>priceLines([{precio:1000,cantidad:1}],{tipo:'valor',valor:2000}),/no puede superar el subtotal/);
  assert.throws(()=>normalizeDiscount({tipo:'porcentaje',valor:120}),/entre 0 y 100/);
  assert.equal(normalizeDiscount({tipo:'valor',valor:''}),null);
  assert.equal(sellerDiscountLimit(34000,{maxSellerDiscountPct:10}),3400);assert.equal(sellerDiscountLimit(34000,undefined),3400);
  assert.equal(discountPercent(34000,30600),10);
  assert.equal(saleSettings({}).maxSellerDiscountPct,10);
  assert.throws(()=>cleanSaleSettings({maxSellerDiscountPct:101}),/entre 0 y 100/);
});

test('API: el vendedor descuenta dentro del tope; se guarda precio_lista, descuento y neto, con auditoría',async()=>{
  const f=await qaPlatform(),S=await f.shop('Descuentos QA',{stock:10,price:34000});
  const body=await f.act(S.seller,sale(S.product,{items:[{producto_id:S.product.id,cantidad:2,precio:34000,descuento:{tipo:'porcentaje',valor:10},precio_unitario:30600}]}));
  const record=body.state.ventas[0],line=record.detalles[0];
  assert.equal(line.precio_lista,34000);assert.equal(line.descuento,3400);assert.equal(line.precio_unitario,30600);assert.equal(record.total,61200);assert.equal(record.descuentos,6800);
  const log=f.state.businesses[S.company.id].auditoria.find(entry=>entry.accion==='descuento_venta'&&entry.documento===record.id);
  assert.ok(log,'auditoría del descuento');assert.equal(log.despues.descuentos,6800);assert.equal(log.antes.lineas[0].precio_lista,34000);
  // El vendedor ve su propia auditoría y no recibe costos.
  assert.ok(body.state.auditoria.some(entry=>entry.accion==='descuento_venta'));
  // Cliente antiguo: solo envía el neto; dentro del tope cuenta como descuento.
  const legacy=await f.act(S.seller,sale(S.product,{items:[{producto_id:S.product.id,cantidad:1,precio_unitario:32000}]}));
  assert.equal(legacy.state.ventas[0].detalles[0].descuento,2000);assert.equal(legacy.state.ventas[0].detalles[0].precio_lista,34000);
});

test('API: por encima del tope o subiendo el precio el vendedor recibe 403 sin cambiar datos',async()=>{
  const f=await qaPlatform(),S=await f.shop('Tope QA',{stock:10,price:34000});
  const before=structuredClone(f.state.businesses[S.company.id]);
  let r=await action(f,S.seller,sale(S.product,{items:[{producto_id:S.product.id,cantidad:1,precio:34000,descuento:{tipo:'porcentaje',valor:15},precio_unitario:28900}]}));
  assert.equal(r.status,403);assert.equal(r.body.code,'DISCOUNT_LIMIT');assert.match(r.body.error,/15 % y supera el tope de 10 %/);
  r=await action(f,S.seller,sale(S.product,{items:[{producto_id:S.product.id,cantidad:1,precio_unitario:20000}]}));assert.equal(r.status,403);assert.equal(r.body.code,'DISCOUNT_LIMIT');
  r=await action(f,S.seller,sale(S.product,{items:[{producto_id:S.product.id,cantidad:1,precio_unitario:40000}]}));assert.equal(r.status,403);assert.match(r.body.error,/no puede cambiar el precio/);
  r=await action(f,S.seller,sale(S.product,{items:[{producto_id:S.product.id,cantidad:1,precio:36000,precio_unitario:36000}]}));assert.equal(r.status,403);
  // Descuento al total del 12 % repartido: también supera el tope por producto.
  r=await action(f,S.seller,sale(S.product,{form:{descuento:{tipo:'porcentaje',valor:12}},items:[{producto_id:S.product.id,cantidad:1,precio:34000,precio_unitario:29920}]}));assert.equal(r.status,403);
  assert.deepEqual(f.state.businesses[S.company.id],before);
  // El administrador sube el tope a 20 %: ahora el 15 % pasa. El vendedor no puede cambiar el tope.
  r=await action(f,S.seller,{type:'settings.update',form:{maxSellerDiscountPct:50}});assert.equal(r.status,403);
  ok(await action(f,S.admin,{type:'settings.update',form:{maxSellerDiscountPct:20}}));
  assert.equal(f.state.businesses[S.company.id].settings.maxSellerDiscountPct,20);
  assert.ok(f.state.businesses[S.company.id].auditoria.some(entry=>entry.accion==='opciones_venta'&&entry.despues.maxSellerDiscountPct===20));
  ok(await action(f,S.seller,sale(S.product,{items:[{producto_id:S.product.id,cantidad:1,precio:34000,descuento:{tipo:'porcentaje',valor:15},precio_unitario:28900}]})));
  r=await action(f,S.admin,{type:'settings.update',form:{maxSellerDiscountPct:-1}});assert.equal(r.status,400);
});

test('API: el administrador cambia el precio y aplica cualquier descuento; neto inconsistente da 409',async()=>{
  const f=await qaPlatform(),S=await f.shop('Admin QA',{stock:10,price:34000});
  let body=await f.act(S.admin,sale(S.product,{items:[{producto_id:S.product.id,cantidad:1,precio:30000,descuento:{tipo:'valor',valor:5000},precio_unitario:25000}]}));
  let line=body.state.ventas[0].detalles[0];assert.equal(line.precio_lista,34000);assert.equal(line.precio_modificado,30000);assert.equal(line.descuento,5000);assert.equal(line.precio_unitario,25000);
  body=await f.act(S.admin,sale(S.product,{items:[{producto_id:S.product.id,cantidad:1,precio_unitario:20000}]}));
  line=body.state.ventas[0].detalles[0];assert.equal(line.precio_modificado,20000);assert.equal(line.descuento,0);assert.equal(body.state.ventas[0].descuentos,undefined);
  const r=await action(f,S.admin,sale(S.product,{items:[{producto_id:S.product.id,cantidad:1,precio:34000,descuento:{tipo:'porcentaje',valor:10},precio_unitario:34000}]}));
  assert.equal(r.status,409);assert.equal(r.body.code,'PRICE_CHANGED');
});

test('API: descuento al total, reportes con total de descuentos y utilidad con precio neto; idempotencia intacta',async()=>{
  const f=await qaPlatform(),S=await f.shop('Reporte QA',{stock:10,price:34000});
  const requestId='descuento-total-1';
  const body={requestId,...sale(S.product,{form:{descuento:{tipo:'valor',valor:8000}},items:[{producto_id:S.product.id,cantidad:2,precio:34000,precio_unitario:30000}]})};
  let r=await f.call(S.admin,'/api/v2/action',body);ok(r);
  const record=r.body.state.ventas[0];assert.equal(record.total,60000);assert.equal(record.descuento_total,8000);assert.equal(record.descuentos,8000);
  const count=r.body.state.ventas.length,stock=r.body.state.prods[0].stock;
  r=await f.call(S.admin,'/api/v2/action',body);ok(r);assert.equal(r.body.state.ventas.length,count);assert.equal(r.body.state.prods[0].stock,stock);
  r=await f.call(S.admin,'/api/v2/action',{...body,form:{...body.form,descuento:{tipo:'valor',valor:7000}}});assert.equal(r.status,400);assert.match(r.body.error,/ya fue usado/);
  const business=f.state.businesses[S.company.id],report=salesReport(business,{from:DAY_D,to:DAY_D});
  assert.equal(report.totals.discounts,8000);assert.equal(report.totals.products,60000);
  // Costo 20000 por unidad: utilidad = 60000 - 40000 (con el neto, no con la lista).
  assert.equal(report.totals.productMargin,20000);
  assert.equal(overviewReport(business,{from:DAY_D,to:DAY_D}).totals.discounts,8000);
  // Una devolución de una unidad devuelve el neto y reduce los descuentos vigentes.
  ok(await action(f,S.admin,{type:'sale.reverse',id:record.id,form:{motivo:'Devolución QA',parcial:true},items:[{index:0,cantidad:1}]}));
  const after=salesReport(f.state.businesses[S.company.id],{from:DAY_D,to:DAY_D});
  assert.equal(after.totals.returns,30000);assert.equal(after.totals.discounts,4000);
  const reports=await f.call(S.admin,'/api/v2/reports?from='+DAY_D+'&to='+DAY_D);ok(reports);assert.equal(reports.body.report.totals.discounts,4000);
});
