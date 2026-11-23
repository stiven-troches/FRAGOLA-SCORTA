// BE-40: proveedores, órdenes de compra (borrador → enviada → parcial/recibida → cerrada/anulada),
// recepción que reutiliza la compra con costo promedio ponderado, cuentas por pagar y pagos.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,AT_D,AT_D1,DAY_D,DAY_D1} from './qa-fixture.mjs';
import {cashBook} from '../caja-credito.mjs';
import {payableAccounts,payablesReport,replenishmentOrderItems} from '../compras-proveedores.mjs';
import {purchaseReport} from '../admin-reports.mjs';

const post=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});

test('proveedor y orden: solo el admin, consecutivo, estados y recepción parcial con costo ponderado',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Compras Uno',{stock:10,price:34000});
 assert.equal((await post(f,S.seller,{type:'supplier.create',form:{nombre:'X'}})).status,403,'el vendedor no crea proveedores');
 const supplier=(await f.act(S.admin,{type:'supplier.create',form:{nombre:'Lubricantes del Valle',nit:'900111222-3',contacto:'Marta',telefono:'3201234567',correo:'ventas@example.invalid',plazoDias:30}})).state.suppliers[0];
 assert.equal(supplier.plazoDias,30);
 assert.equal((await post(f,S.admin,{type:'supplier.create',form:{nombre:'lubricantes del valle'}})).status,400,'nombre único');
 const updated=await f.act(S.admin,{type:'supplier.update',id:supplier.id,form:{plazoDias:45}});assert.equal(updated.state.suppliers[0].plazoDias,45);
 assert.equal((await post(f,S.seller,{type:'po.create',form:{supplierId:supplier.id,items:[{producto_id:S.product.id,cantidad:10,costo:20000}]}})).status,403,'el vendedor no crea órdenes');
 const created=await f.act(S.admin,{type:'po.create',form:{supplierId:supplier.id,nota:'Urgente',items:[{producto_id:S.product.id,cantidad:10,costo:26000}]}});
 let order=created.state.purchaseOrders[0];
 assert.equal(order.numero,'OC-0001');assert.equal(order.estado,'borrador');assert.equal(order.total,260000);assert.equal(order.proveedor,'Lubricantes del Valle');
 assert.equal(created.state.prods[0].stock,10,'crear la orden no cambia el stock');
 order=(await f.act(S.admin,{type:'po.update',id:order.id,form:{items:[{producto_id:S.product.id,cantidad:10,costo:26000}],nota:'Urgente 2'}})).state.purchaseOrders[0];
 order=(await f.act(S.admin,{type:'po.send',id:order.id})).state.purchaseOrders[0];assert.equal(order.estado,'enviada');
 assert.equal((await post(f,S.admin,{type:'po.update',id:order.id,form:{nota:'x'}})).body.code,'PO_STATUS','enviada no se edita');
 // Recepción parcial a crédito: crea la compra existente por lo recibido.
 const partial=await f.act(S.admin,{type:'po.receive',id:order.id,form:{items:[{producto_id:S.product.id,cantidad:4}],credito:true,factura:'FV-881'}});
 order=partial.state.purchaseOrders[0];const purchase=partial.state.compras[0];
 assert.equal(order.estado,'parcial');assert.equal(order.items[0].recibido,4);assert.equal(order.recepciones[0].compraId,purchase.id);
 assert.equal(purchase.total,104000);assert.equal(purchase.ordenCompraNumero,'OC-0001');assert.equal(purchase.supplierId,supplier.id);assert.equal(purchase.factura,'FV-881');
 assert.deepEqual(purchase.credito,{monto:104000,saldo:104000,pagado:0,plazoDias:45,vence:'2027-01-03'});
 // Costo promedio ponderado: (10 × 20.000 + 4 × 26.000) / 14.
 assert.equal(partial.state.prods[0].stock,14);assert.equal(partial.state.prods[0].precio_compra,21714.29);
 assert.ok(partial.state.movimientos.some(m=>m.tipo==='compra'&&m.documento===purchase.id&&m.cantidad===4));
 assert.equal((await post(f,S.admin,{type:'po.receive',id:order.id,form:{items:[{producto_id:S.product.id,cantidad:7}]}})).body.code,'PO_OVER_RECEIPT');
 assert.equal((await post(f,S.admin,{type:'po.cancel',id:order.id,form:{motivo:'x'}})).body.code,'PO_STATUS','con recepciones se cierra, no se anula');
 const full=await f.act(S.admin,{type:'po.receive',id:order.id,form:{items:[{producto_id:S.product.id,cantidad:6,costo:25000}]}});
 order=full.state.purchaseOrders[0];assert.equal(order.estado,'recibida');assert.equal(full.state.compras[0].credito,undefined,'la segunda recepción fue de contado');
 order=(await f.act(S.admin,{type:'po.close',id:order.id,form:{nota:'Completa'}})).state.purchaseOrders[0];assert.equal(order.estado,'cerrada');
 const report=purchaseReport(full.state,{from:DAY_D,to:DAY_D});assert.equal(report.totals.count,2);
 // Anular una orden en borrador.
 const draft=(await f.act(S.admin,{type:'po.create',form:{proveedor:'Proveedor sin ficha',items:[{producto_id:S.product.id,cantidad:1}]}})).state.purchaseOrders[0];
 assert.equal(draft.numero,'OC-0002');assert.equal(draft.supplierId,null);
 assert.equal((await post(f,S.admin,{type:'po.cancel',id:draft.id,form:{}})).status,400,'motivo obligatorio');
 assert.equal((await f.act(S.admin,{type:'po.cancel',id:draft.id,form:{motivo:'Duplicada'}})).state.purchaseOrders[0].estado,'anulada');
 // El vendedor no ve proveedores, órdenes ni compras.
 const seller=await f.data(S.seller);assert.equal(seller.state.suppliers,undefined);assert.equal(seller.state.purchaseOrders,undefined);assert.deepEqual(seller.state.compras,[]);
});

test('cuentas por pagar: saldo por proveedor, vencidos, pago en efectivo sale de la caja',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Compras Dos',{stock:2,price:34000});
 const supplier=(await f.act(S.admin,{type:'supplier.create',form:{nombre:'Frenos SAS',plazoDias:1}})).state.suppliers[0];
 // Ingresar mercancía (compra directa) a crédito, sin ficha no se permite.
 const fresh=await f.data(S.admin);
 const noCard=await post(f,S.admin,{type:'business.change',payload:{kind:'compra',form:{fecha:DAY_D,proveedor:'Suelto',credito:true},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:20000}]}});
 assert.equal(noCard.body.code,'SUPPLIER_REQUIRED');
 await f.act(S.admin,{type:'business.change',payload:{kind:'compra',form:{fecha:DAY_D,supplierId:supplier.id,credito:true,factura:'A-1'},items:[{producto_id:S.product.id,cantidad:3,precio_unitario:20000}]}});
 await f.act(S.admin,{type:'business.change',payload:{kind:'compra',form:{fecha:DAY_D,supplierId:supplier.id,credito:true,plazoDias:10,factura:'A-2'},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:20000}]}});
 f.setNow(AT_D1);
 let data=await f.data(S.admin);
 let account=data.state.payableAccounts[0];
 assert.equal(account.saldo,80000);assert.equal(account.facturas.length,2);assert.equal(fresh.revision<data.revision,true);
 assert.equal(payableAccounts(data.state,'2026-11-21')[0].vencido,60000,'la factura de 1 día vence el 20');
 assert.equal((await post(f,S.seller,{type:'payable.payment',form:{supplierId:supplier.id,amount:1000,method:'efectivo'}})).status,403,'el vendedor no paga proveedores');
 assert.equal((await post(f,S.admin,{type:'payable.payment',form:{supplierId:supplier.id,amount:90000,method:'efectivo'}})).body.code,'PAYMENT_EXCEEDS_BALANCE');
 const paid=await f.act(S.admin,{type:'payable.payment',form:{supplierId:supplier.id,amount:70000,method:'efectivo',nota:'Abono'}});
 const payment=paid.state.supplierPayments[0];
 assert.equal(payment.numero,'PP-0001');assert.deepEqual(payment.aplicado.map(a=>[a.factura,a.amount]),[['A-1',60000],['A-2',10000]],'de la más antigua a la más nueva');
 assert.equal(paid.state.payableAccounts[0].saldo,10000);assert.equal(paid.document.kind,'pago-proveedor');
 const book=cashBook(paid.state,DAY_D1);assert.equal(book.rows.efectivo.gastos,70000,'el pago en efectivo sale de la caja');
 assert.ok(paid.state.cashMovements.some(m=>m.tipo==='pago_proveedor'&&m.pagoProveedorId===payment.id));
 // Por transferencia no toca la caja del almacén.
 const bank=await f.act(S.admin,{type:'payable.payment',form:{supplierId:supplier.id,amount:10000,method:'transferencia'}});
 assert.equal(cashBook(bank.state,DAY_D1).rows.transferencia.gastos,0);assert.equal(bank.state.payableAccounts[0].saldo,0);
 assert.equal((await post(f,S.admin,{type:'payable.payment',form:{supplierId:supplier.id,amount:1,method:'efectivo'}})).body.code,'NO_BALANCE');
 // Una compra con pagos no se anula.
 const purchase=bank.state.compras.find(c=>c.factura==='A-1');
 const cancel=await post(f,S.admin,{type:'business.change',payload:{kind:'reversion',id:purchase.id,form:{tipo:'compra',motivo:'Error'}}});assert.equal(cancel.body.code,'PURCHASE_HAS_PAYMENTS');
 const rows=payablesReport(bank.state,DAY_D1).rows;assert.equal(rows.length,0);
 assert.ok(bank.state.auditoria.some(a=>a.accion==='pago_proveedor'));
 // Con la caja cerrada no se paga en efectivo.
 await f.act(S.admin,{type:'business.change',payload:{kind:'compra',form:{fecha:DAY_D1,supplierId:supplier.id,credito:true},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:20000}]}});
 data=await f.data(S.admin);const expected=cashBook(data.state,DAY_D1).expected;
 await f.act(S.admin,{type:'cash.close',form:{date:DAY_D1,actual:Object.fromEntries(Object.keys(expected).map(k=>[k,Math.max(0,expected[k])]))}});
 assert.equal((await post(f,S.admin,{type:'payable.payment',form:{supplierId:supplier.id,amount:1000,method:'efectivo'}})).body.code,'CASH_ALREADY_CLOSED');
 ok(await post(f,S.admin,{type:'payable.payment',form:{supplierId:supplier.id,amount:1000,method:'nequi'}}));
});

test('orden desde reposición, anulación de compra recibida, aislamiento y plan',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Compras Tres',{stock:1,price:34000}),B=await f.shop('Compras Otra');
 const data=await f.data(S.admin);
 const suggested=replenishmentOrderItems(data.state.prods);
 assert.deepEqual(suggested.map(i=>[i.producto_id,i.cantidad,i.costo]),[[S.product.id,1,20000]]);
 const order=(await f.act(S.admin,{type:'po.create',form:{proveedor:'Sugerido',origen:'reposicion',items:suggested}})).state.purchaseOrders[0];
 assert.equal(order.origen,'reposicion');
 const received=await f.act(S.admin,{type:'po.receive',id:order.id,form:{items:[{producto_id:S.product.id,cantidad:1}]}});
 assert.equal(received.state.purchaseOrders[0].estado,'recibida');
 const cancelled=await f.act(S.admin,{type:'business.change',payload:{kind:'reversion',id:received.state.compras[0].id,form:{tipo:'compra',motivo:'Llegó dañado'}}});
 assert.equal(cancelled.state.purchaseOrders[0].estado,'enviada');assert.equal(cancelled.state.purchaseOrders[0].items[0].recibido,0);assert.equal(cancelled.state.purchaseOrders[0].recepciones[0].anulada,true);
 assert.equal((await post(f,B.admin,{type:'po.receive',id:order.id,form:{items:[{producto_id:S.product.id,cantidad:1}]}})).status,404,'otra empresa no ve la orden');
 await f.act('owner',{type:'company.plan',companyId:S.company.id,form:{features:['credito']}});
 assert.equal((await post(f,S.admin,{type:'po.create',form:{proveedor:'X',items:[{producto_id:S.product.id,cantidad:1}]}})).body.code,'PLAN_LIMIT');
 ok(await post(f,S.admin,{type:'po.receive',id:order.id,form:{items:[{producto_id:S.product.id,cantidad:1}]}}));
});
