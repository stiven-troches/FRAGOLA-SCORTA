// BE-17: cotizaciones. No descuentan stock, usan las reglas de precio de la venta, tienen
// consecutivo y vigencia, se anulan y se convierten en venta validando stock y precios.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,AT_D,AT_D1,DAY_D,DAY_D1} from './qa-fixture.mjs';
import {quoteStatus,quoteCounts} from '../cotizaciones.mjs';
import {cashBook} from '../caja-credito.mjs';

const post=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
const item=(product,cantidad=1,extra={})=>({producto_id:product.id,cantidad,precio:product.precio_venta,...extra});

test('cotización: no toca el stock, usa precios y descuentos de la venta, consecutivo y vigencia',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Cotiza Uno',{stock:3,price:34000});
 const created=await f.act(S.seller,{type:'quote.create',form:{cliente:'Mecánico Pérez',telefono:'3001112233',dataConsent:true,nota:'Entrega en 2 días',items:[item(S.product,2,{descuento:{tipo:'porcentaje',valor:5}})]}});
 assert.equal(created.document.kind,'cotizacion');
 const quote=created.state.quotes[0];
 assert.equal(quote.numero,'COT-0001');assert.equal(quote.fecha,DAY_D);assert.equal(quote.vence,'2026-12-04','15 días por defecto');
 assert.equal(quote.detalles[0].precio_lista,34000);assert.equal(quote.detalles[0].precio_unitario,32300);assert.equal(quote.total,64600);assert.equal(quote.descuentos,3400);
 assert.equal(created.state.prods[0].stock,3,'la cotización no descuenta stock');assert.equal(created.state.prods[0].stock_reservado??0,0);
 assert.equal(quoteStatus(quote,DAY_D),'vigente');assert.equal(quoteStatus(quote,'2026-12-05'),'vencida');
 assert.ok(created.state.auditoria.some(a=>a.accion==='cotizacion_creada'&&a.documento===quote.id));
 // El vendedor tiene el mismo tope de descuento que en la venta y no cambia el precio de lista.
 const over=await post(f,S.seller,{type:'quote.create',form:{items:[item(S.product,1,{descuento:{tipo:'porcentaje',valor:30}})]}});assert.equal(over.status,403);assert.equal(over.body.code,'DISCOUNT_LIMIT');
 const price=await post(f,S.seller,{type:'quote.create',form:{items:[item(S.product,1,{precio:20000})]}});assert.equal(price.status,403);
 // Vigencia configurable por la empresa y por cotización; el número no se reutiliza.
 await f.act(S.admin,{type:'settings.update',form:{cotizaciones:{validDays:7}}});
 const second=await f.act(S.admin,{type:'quote.create',form:{items:[item(S.product,10)]}});
 assert.equal(second.state.quotes[0].numero,'COT-0002');assert.equal(second.state.quotes[0].vence,'2026-11-26');assert.equal(second.state.quotes[0].cliente,'Cliente general');
 const third=await f.act(S.admin,{type:'quote.create',form:{dias:30,items:[item(S.product,1)]}});assert.equal(third.state.quotes[0].vence,'2026-12-19');
 // Cotizar más unidades de las que hay es posible (no reserva); convertirla no.
 const short=await post(f,S.admin,{type:'quote.convert',id:second.state.quotes[0].id,form:{paymentMethod:'efectivo'}});
 assert.equal(short.status,409);assert.equal(short.body.code,'INSUFFICIENT_STOCK');assert.equal(short.body.details.stock[0].disponible,3);
 // Anular: el vendedor solo las suyas; queda el motivo.
 const foreign=await post(f,S.seller,{type:'quote.cancel',id:third.state.quotes[0].id,form:{motivo:'No'}});assert.equal(foreign.status,403);
 const cancelled=await f.act(S.admin,{type:'quote.cancel',id:third.state.quotes[0].id,form:{motivo:'El cliente desistió'}});
 assert.equal(cancelled.state.quotes[0].estado,'anulada');assert.equal(cancelled.state.quotes[0].anulacion.motivo,'El cliente desistió');
 assert.equal((await post(f,S.admin,{type:'quote.cancel',id:third.state.quotes[0].id,form:{motivo:'otra vez'}})).body.code,'QUOTE_CLOSED');
 assert.deepEqual(quoteCounts(cancelled.state.quotes,DAY_D),{vigente:2,vencida:0,convertida:0,anulada:1});
});

test('convertir: crea la venta del día, descuenta stock, enlaza la cotización y avisa si cambió el precio',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Cotiza Dos',{stock:5,price:50000});
 const quote=(await f.act(S.seller,{type:'quote.create',form:{cliente:'Laura',items:[item(S.product,2,{descuento:{tipo:'valor',valor:2000}})]}})).state.quotes[0];
 assert.equal(quote.total,96000);
 // El precio sube antes de convertir: 409 QUOTE_CHANGED con el detalle.
 const fresh=await f.data(S.admin);
 await f.act(S.admin,{type:'business.change',revision:fresh.revision,payload:{kind:'producto',form:{...fresh.state.prods[0],precio_venta:55000}}});
 f.setNow(AT_D1);
 const changed=await post(f,S.seller,{type:'quote.convert',id:quote.id,form:{paymentMethod:'efectivo'}});
 assert.equal(changed.status,409);assert.equal(changed.body.code,'QUOTE_CHANGED');
 assert.deepEqual(changed.body.details.changes,[{nombre:S.product.nombre,cantidad:2,antes:48000,ahora:53000}]);assert.equal(changed.body.details.totalAhora,106000);
 assert.equal((await f.data(S.admin)).state.prods[0].stock,5,'el rechazo no cambia nada');
 // Aceptando los precios actuales se vende y queda el aviso.
 const converted=await f.act(S.seller,{type:'quote.convert',id:quote.id,form:{paymentMethod:'efectivo',aceptarCambios:true}});
 assert.match(converted.warning,/precios actuales/);assert.ok(converted.receiptLink?.url,'la venta tiene comprobante');
 const sale=converted.state.ventas.find(s=>s.id===converted.document.id),stored=converted.state.quotes.find(q=>q.id===quote.id);
 assert.equal(sale.fecha,DAY_D1);assert.equal(sale.total,106000);assert.equal(sale.cotizacionNumero,'COT-0001');assert.equal(sale.detalles[0].descuento,2000);
 assert.equal(stored.estado,'convertida');assert.equal(stored.saleId,sale.id);assert.equal(stored.cambiosAceptados.length,1);
 assert.equal(converted.state.prods[0].stock,3);
 const admin=await f.data(S.admin);assert.equal(cashBook(admin.state,DAY_D1).rows.efectivo.ventas,106000);
 assert.ok(admin.state.auditoria.some(a=>a.accion==='cotizacion_convertida'));
 const again=await post(f,S.seller,{type:'quote.convert',id:quote.id,form:{paymentMethod:'efectivo'}});assert.equal(again.status,409);assert.equal(again.body.code,'QUOTE_CLOSED');
});

test('convertir sin cambios, a crédito con la ficha y con requestId idempotente',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Cotiza Tres',{stock:4,price:20000});
 const card=(await f.act(S.admin,{type:'customer.create',form:{nombre:'Taller Uno',telefono:'3004445566',tipo:'mecanico',dataConsent:true,creditLimit:100000}})).state.customerRecords[0];
 const fresh=await f.data(S.admin);
 await f.act(S.admin,{type:'business.change',revision:fresh.revision,payload:{kind:'producto',form:{...fresh.state.prods[0],precios:{mecanico:18000}}}});
 const quote=(await f.act(S.seller,{type:'quote.create',form:{customerId:card.id,items:[{producto_id:S.product.id,cantidad:2,precio:18000}]}})).state.quotes[0];
 assert.equal(quote.tipoCliente,'mecanico');assert.equal(quote.total,36000);assert.equal(quote.cliente,'Taller Uno');
 const body={type:'quote.convert',id:quote.id,requestId:'convert-once',form:{paymentMethod:'credito'}};
 const first=await f.call(S.seller,'/api/v2/action',body);ok(first);
 const repeat=await f.call(S.seller,'/api/v2/action',body);ok(repeat);
 const admin=await f.data(S.admin);
 assert.equal(admin.state.ventas.filter(s=>s.cotizacionId===quote.id).length,1,'el reintento no duplica la venta');
 assert.equal(admin.state.prods[0].stock,2);assert.equal(admin.state.creditAccounts[0].saldo,36000);
});

test('aislamiento, plan y comprobante: otra empresa no ve ni convierte; plan sin cotizaciones bloquea',async()=>{
 const f=await qaPlatform({now:AT_D}),A=await f.shop('Cotiza A'),B=await f.shop('Cotiza B');
 const quote=(await f.act(A.seller,{type:'quote.create',form:{items:[item(A.product)]}})).state.quotes[0];
 const other=await post(f,B.admin,{type:'quote.convert',id:quote.id,form:{paymentMethod:'efectivo'}});assert.equal(other.status,404);
 assert.equal((await f.data(B.admin)).state.quotes.length,0);
 await f.act('owner',{type:'company.plan',companyId:A.company.id,form:{features:['credito','garantias','ordenes_compra','iva']}});
 const blocked=await post(f,A.seller,{type:'quote.create',form:{items:[item(A.product)]}});assert.equal(blocked.status,403);assert.equal(blocked.body.code,'PLAN_LIMIT');assert.match(blocked.body.error,/cotizaciones/);
 assert.equal((await post(f,A.seller,{type:'quote.convert',id:quote.id,form:{paymentMethod:'efectivo'}})).body.code,'PLAN_LIMIT');
 ok(await post(f,A.seller,{type:'quote.cancel',id:quote.id,form:{motivo:'Plan cambiado'}}));
});
