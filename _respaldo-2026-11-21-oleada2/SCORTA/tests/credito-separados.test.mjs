// BE-34: separados con abonos. Stock reservado, abonos a caja, entrega como venta y cancelación.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,AT_D,AT_D1,DAY_D,DAY_D1} from './qa-fixture.mjs';
import {cashBook,layawayExpired} from '../caja-credito.mjs';
import {salesReport,inventoryReport} from '../admin-reports.mjs';

const post=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});

test('separado completo: reserva stock que no se puede vender, abonos a caja y entrega como venta',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Separado Completo',{stock:3,price:34000});
 const created=await f.act(S.seller,{type:'layaway.create',form:{cliente:'María Separa',telefono:'3009998877',dataConsent:true,items:[{producto_id:S.product.id,cantidad:2}],deposit:{amount:20000,method:'efectivo'}}});
 assert.equal(created.document.kind,'separado');
 let layaway=created.state.layaways[0],product=created.state.prods[0];
 assert.equal(layaway.numero,'SEP-0001');assert.equal(layaway.total,68000);assert.equal(layaway.pagado,20000);assert.equal(layaway.saldo,48000);assert.equal(layaway.vence,'2026-12-19');
 assert.equal(product.stock,1);assert.equal(product.stock_reservado,2);
 // Las unidades separadas no se pueden vender a otro cliente.
 const blocked=await post(f,S.seller2,f.saleBody(S.product,{cantidad:2}));assert.equal(blocked.status,400);assert.match(blocked.body.error,/Stock insuficiente/);
 const second=await post(f,S.seller2,{type:'layaway.create',form:{cliente:'Otro',items:[{producto_id:S.product.id,cantidad:2}]}});assert.equal(second.status,409);assert.equal(second.body.code,'INSUFFICIENT_STOCK');
 // Editar la ficha conserva las unidades separadas; el producto no se puede retirar.
 const edited=await f.act(S.admin,{type:'business.change',revision:(await f.data(S.admin)).revision,payload:{kind:'producto',form:{...S.product,stock:undefined,precio_venta:35000}}});
 assert.equal(edited.state.prods[0].stock_reservado,2);
 const inventory=inventoryReport(edited.state);assert.equal(inventory.rows[0].reserved,2);assert.equal(inventory.rows[0].stockValue,60000);
 f.setNow(AT_D1);
 const early=await post(f,S.seller,{type:'layaway.deliver',id:layaway.id});assert.equal(early.status,409);assert.equal(early.body.code,'LAYAWAY_BALANCE');
 assert.equal((await post(f,S.seller,{type:'layaway.payment',id:layaway.id,form:{amount:50000,method:'nequi'}})).status,400,'no se abona más que el saldo');
 await f.act(S.seller,{type:'layaway.payment',id:layaway.id,form:{amount:28000,method:'nequi'}});
 const delivered=await f.act(S.seller,{type:'layaway.deliver',id:layaway.id,form:{payment:{amount:20000,method:'efectivo'}}});
 layaway=delivered.state.layaways[0];product=delivered.state.prods[0];
 assert.equal(layaway.estado,'entregado');assert.equal(layaway.abonos.length,3);assert.equal(product.stock,1);assert.equal(product.stock_reservado,0);
 const sale=delivered.state.ventas.find(s=>s.id===layaway.saleId);
 assert.equal(sale.fecha,DAY_D1);assert.equal(sale.total,68000);assert.deepEqual(sale.payments,[{method:'anticipo',amount:68000}]);assert.equal(sale.detalles[0].precio_unitario,34000);
 assert.ok(delivered.receiptLink?.url,'la venta entregada tiene comprobante');
 const admin=await f.data(S.admin),saleAdmin=admin.state.ventas.find(s=>s.id===layaway.saleId);assert.equal(saleAdmin.detalles[0].costo_unitario,20000);
 // Los abonos entraron a la caja de su día; la venta entregada no se vuelve a sumar.
 assert.equal(cashBook(admin.state,DAY_D).rows.efectivo.separados,20000);
 const d1=cashBook(admin.state,DAY_D1);assert.equal(d1.rows.nequi.separados,28000);assert.equal(d1.rows.efectivo.separados,20000);assert.equal(d1.rows.efectivo.ventas,0);assert.equal(d1.layawaySales,68000);
 // Causación: la venta (y su utilidad) cuenta el día de la entrega.
 const report=salesReport(admin.state,{from:DAY_D1,to:DAY_D1});assert.equal(report.totals.net,68000);assert.equal(report.totals.productMargin,28000);assert.equal(report.unknownPaymentCount,0);
 assert.ok(admin.state.movimientos.some(m=>m.tipo==='separado'&&m.cantidad===-2));assert.ok(admin.state.movimientos.some(m=>m.tipo==='entrega_separado'&&m.cantidad===0));
 for(const action of ['separado_creado','separado_abono','separado_entregado'])assert.ok(admin.state.auditoria.some(a=>a.accion===action),action);
 assert.equal((await post(f,S.seller,{type:'layaway.payment',id:layaway.id,form:{amount:1,method:'efectivo'}})).status,409);
});

test('separado cancelado: el vendedor no anula; el administrador devuelve mercancía y reembolsa o deja saldo a favor',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Separado Cancelado',{stock:5,price:34000});
 const card=(await f.act(S.admin,{type:'customer.create',form:{nombre:'Cliente Favor'}})).state.customerRecords[0];
 const one=(await f.act(S.seller,{type:'layaway.create',form:{cliente:'Pedro',items:[{producto_id:S.product.id,cantidad:1}],deposit:{amount:10000,method:'efectivo'}}})).state.layaways[0];
 const two=(await f.act(S.seller,{type:'layaway.create',form:{customerId:card.id,dias:5,items:[{producto_id:S.product.id,cantidad:2}],deposit:{amount:30000,method:'transferencia'}}})).state.layaways[0];
 assert.equal(two.cliente,'Cliente Favor');assert.equal(two.vence,'2026-11-24');
 assert.equal((await post(f,S.seller,{type:'layaway.cancel',id:one.id,form:{motivo:'No volvió',destino:'reembolso',method:'efectivo'}})).status,403);
 assert.equal((await post(f,S.admin,{type:'layaway.cancel',id:one.id,form:{destino:'reembolso'}})).status,400,'exige motivo');
 assert.equal((await post(f,S.admin,{type:'layaway.cancel',id:one.id,form:{motivo:'Sin ficha',destino:'saldo_a_favor'}})).status,400);
 f.setNow(AT_D1);
 const refunded=await f.act(S.admin,{type:'layaway.cancel',id:one.id,form:{motivo:'No volvió por la mercancía',destino:'reembolso',method:'efectivo'}});
 assert.equal(refunded.state.prods[0].stock,3);assert.equal(refunded.state.prods[0].stock_reservado,2);
 assert.equal(cashBook(refunded.state,DAY_D1).rows.efectivo.devoluciones,10000);assert.equal(cashBook(refunded.state,DAY_D).rows.efectivo.separados,10000);
 const favored=await f.act(S.admin,{type:'layaway.cancel',id:two.id,form:{motivo:'Cambió de opinión',destino:'saldo_a_favor'}});
 assert.equal(favored.state.prods[0].stock,5);assert.equal(favored.state.prods[0].stock_reservado,0);
 assert.equal(favored.state.customerRecords[0].saldoAFavor,30000);assert.equal(favored.state.layaways.find(l=>l.id===two.id).cancelacion.saldoAFavor,30000);
 assert.ok(favored.state.auditoria.some(a=>a.accion==='separado_cancelado'&&a.motivo==='Cambió de opinión'));
 // El saldo a favor paga parte de una venta posterior y no entra a la caja.
 const sold=await f.act(S.seller,{type:'sale.create',form:{cliente:card.nombre,customerId:card.id,paymentMethod:'efectivo',payments:[{method:'saldo_favor',amount:30000},{method:'efectivo',amount:4000}]},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:34000}],labor:[]});
 assert.equal((await f.data(S.admin)).state.customerRecords[0].saldoAFavor,0);
 assert.equal(cashBook(sold.state,DAY_D1).rows.efectivo.ventas,4000);
 const again=await post(f,S.seller,{type:'sale.create',form:{cliente:card.nombre,customerId:card.id,paymentMethod:'saldo_favor'},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:34000}],labor:[]});
 assert.equal(again.status,400);assert.equal(again.body.code,'FAVOR_INSUFFICIENT');
 assert.equal((await post(f,S.admin,{type:'layaway.cancel',id:two.id,form:{motivo:'x',destino:'reembolso'}})).status,409);
});

test('separados: vencimiento configurable, idempotencia y aislamiento entre empresas',async()=>{
 const f=await qaPlatform({now:AT_D}),A=await f.shop('Separado Uno',{stock:5}),B=await f.shop('Separado Dos',{stock:5});
 await f.act(A.admin,{type:'settings.update',form:{caja:{layawayDays:10}}});
 const requestId=crypto.randomUUID(),body={type:'layaway.create',form:{cliente:'Laura',items:[{producto_id:A.product.id,cantidad:1}]}};
 ok(await f.call(A.seller,'/api/v2/action',{requestId,...body}));ok(await f.call(A.seller,'/api/v2/action',{requestId,...body}));
 const data=await f.data(A.admin);assert.equal(data.state.layaways.length,1,'el mismo requestId no crea dos separados');assert.equal(data.state.prods[0].stock,4);
 const layaway=data.state.layaways[0];assert.equal(layaway.vence,'2026-11-29');
 assert.equal(layawayExpired(layaway,'2026-11-29'),false);assert.equal(layawayExpired(layaway,'2026-11-30'),true);
 const foreign=await post(f,B.admin,{type:'layaway.payment',id:layaway.id,form:{amount:1,method:'efectivo'}});assert.equal(foreign.status,404);
 const foreignProduct=await post(f,B.seller,{type:'layaway.create',form:{cliente:'X',items:[{producto_id:A.product.id,cantidad:1}]}});assert.equal(foreignProduct.status,400);
 assert.equal((await f.data(B.admin)).state.layaways.length,0);
 assert.equal((await post(f,A.seller,{type:'layaway.create',form:{cliente:'Cliente general',items:[{producto_id:A.product.id,cantidad:1}]}})).status,400);
 assert.equal((await post(f,A.seller,{type:'layaway.create',form:{cliente:'Sin productos',items:[]}})).status,400);
 // Seller sees costs removed.
 const seller=await f.data(A.seller);assert.equal(seller.state.layaways[0].detalles[0].costo_unitario,undefined);
});
