// Builds a realistic platform state through the real engine (platformRequest), for the
// import/verify/report tests. Fictitious data only; credentials live in memory.
// Covers: several companies, sales with labor and mechanics, partial returns, full
// cancellations, purchases and a cancelled purchase (cost replay), cash closures with a
// post-closure return, tickets with replies, customers (update + consent), drafts,
// terms, renewals (payments), and a legacy delivered workshop service.
import {qaPlatform, ok, DAY_D, AT_D1, OWNER_PASSWORD} from '../tests/qa-fixture.mjs';

export async function buildSampleState() {
  const f = await qaPlatform();
  const shops = [];
  for (const name of ['Taller Norte', 'Repuestos Sur', 'Motos Centro']) {
    const shop = await f.shop(name, {stock: 50, price: 34000});
    let body = await f.act(shop.admin, {type: 'business.change', payload: {kind: 'importar', items: [
      {nombre: 'Filtro de aceite ' + name, referencia: 'FA-' + name.length, categoria: 'Filtros', marca: 'Honda', precio_compra: 8000, precio_venta: 15000.5, stock: 40, stock_minimo: 5},
      {nombre: 'Pastillas de freno ' + name, referencia: 'PF-' + name.length, categoria: 'Frenos', marca: 'Yamaha', precio_compra: 22000, precio_venta: 39900, stock: 12, stock_minimo: 2},
      {nombre: 'Bujía ' + name, referencia: 'BJ-' + name.length, categoria: 'Encendido', marca: 'NGK', precio_venta: 12000, stock: 30},
    ]}});
    const [filtro, pastillas, bujia] = ['Filtro de aceite', 'Pastillas de freno', 'Bujía'].map(prefix => body.state.prods.find(p => p.nombre.startsWith(prefix)));
    // Two purchases; the first one is cancelled afterwards (BE-23 cost replay).
    body = await f.act(shop.admin, {type: 'business.change', payload: {kind: 'compra', form: {fecha: DAY_D, proveedor: 'Proveedor QA'}, items: [{producto_id: filtro.id, cantidad: 10, precio_unitario: 9000}, {producto_id: bujia.id, cantidad: 5, precio_unitario: 5000}]}});
    const cancelledPurchase = body.state.compras[0];
    await f.act(shop.admin, {type: 'business.change', payload: {kind: 'compra', form: {fecha: DAY_D, proveedor: 'Otro proveedor'}, items: [{producto_id: filtro.id, cantidad: 4, precio_unitario: 10000}]}});
    await f.act(shop.admin, {type: 'business.change', payload: {kind: 'reversion', id: cancelledPurchase.id, form: {tipo: 'compra', motivo: 'Factura errada'}}});
    await f.act(shop.admin, {type: 'business.change', payload: {kind: 'ajuste', id: pastillas.id, form: {stock: 11, motivo: 'Conteo físico'}}});
    // Sales: cash, transfer with a customer and consent, card with labor (workshop service).
    const s1 = await f.act(shop.seller, f.saleBody(shop.product, {cantidad: 2}));
    const s2 = await f.act(shop.admin, {type: 'sale.create', form: {cliente: 'Ana Pérez', telefono: '3001234567', dataConsent: true, paymentMethod: 'transferencia'},
      items: [{producto_id: filtro.id, cantidad: 3, precio_unitario: filtro.precio_venta}, {producto_id: bujia.id, cantidad: 2, precio_unitario: bujia.precio_venta}], labor: []});
    const s3 = await f.act(shop.admin, {type: 'sale.create', form: {cliente: 'Luis Gómez', placa: 'ABC12D', paymentMethod: 'tarjeta', dataConsent: true},
      items: [{producto_id: pastillas.id, cantidad: 1, precio_unitario: pastillas.precio_venta}],
      labor: [{mecanicoId: shop.mechanic.id, descripcion: 'Cambio de pastillas', importe: 25000}]});
    const s4 = await f.act(shop.seller2, f.saleBody(shop.product, {cantidad: 1, paymentMethod: 'transferencia'}));
    // Partial return of one unit, and a full cancellation.
    ok(await f.call(shop.admin, '/api/v2/action', {requestId: crypto.randomUUID(), type: 'sale.reverse', id: s2.receiptLink.saleId, form: {motivo: 'Devuelve una unidad', parcial: true}, items: [{index: 0, cantidad: 1}]}));
    ok(await f.call(shop.admin, '/api/v2/action', {requestId: crypto.randomUUID(), type: 'sale.reverse', id: s4.receiptLink.saleId, form: {motivo: 'Venta duplicada', parcial: false}, items: []}));
    // Cash closure of day D, then (day D+1) a return on a sale of the closed day.
    ok(await f.call(shop.admin, '/api/v2/action', {requestId: crypto.randomUUID(), type: 'cash.close', form: {date: DAY_D, actual: {efectivo: 68000, transferencia: 30000, tarjeta: 64900}, note: 'Cierre QA'}}));
    shops.push({...shop, name, s1, filtro, pastillas, bujia, sales: [s1, s2, s3, s4].map(body => body.receiptLink.saleId)});
  }
  f.setNow(AT_D1);
  await f.login('owner', 'Fragola', 'owner', OWNER_PASSWORD);
  for (const shop of shops) {
    const {name, s1, bujia} = shop;
    ok(await f.call(shop.admin, '/api/v2/action', {requestId: crypto.randomUUID(), type: 'sale.reverse', id: s1.receiptLink.saleId, form: {motivo: 'Cliente devolvió', parcial: true}, items: [{index: 0, cantidad: 1}]}));
    await f.act(shop.seller, f.saleBody(shop.product, {cantidad: 1, paymentMethod: 'tarjeta'}));
    await f.act(shop.admin, {type: 'mechanic.create', form: {name: 'Segundo mecánico', percentage: 35.5}});
    await f.act(shop.admin, {type: 'ticket.reply', id: shop.ticket.id, form: {message: 'Información adicional'}});
    await f.act(shop.admin, {type: 'terms.accept', form: {}});
    const customer = (await f.data(shop.admin)).state.customerRecords.find(c => c.nombre === 'Ana Pérez');
    await f.act(shop.admin, {type: 'customer.update', id: customer.id, form: {nombre: 'Ana María Pérez'}});
    ok(await f.call(shop.seller, '/api/v2/draft', {version: 0, writeId: 'draft-' + name, draft: {cart: [{producto_id: bujia.id, nombre: bujia.nombre, cantidad: 1, precio_unitario: bujia.precio_venta}], labor: [], laborDraft: {descripcion: '', mecanico: '', importe: ''}, saleForm: {cliente: '', telefono: '', placa: '', fecha: '', paymentMethod: 'efectivo'}}}));
  }
  await f.act('owner', {type: 'ticket.reply', id: shops[0].ticket.id, form: {message: 'Respuesta del propietario'}});
  await f.act('owner', {type: 'company.renew', companyId: shops[1].company.id, form: {endDate: '2027-01-31', amount: 1000}});
  // Legacy workshop service delivered before sales carried labor (only in old data).
  const state = structuredClone(f.state), legacy = state.businesses[shops[2].company.id];
  legacy.servs.push({id: 'legacy-1', fecha: '2026-10-30', fecha_entrega: '2026-11-02', usuario: 'admin', placa: 'XYZ98A', marca_moto: 'Honda', descripcion_trabajo: 'Sincronización',
    mecanico: 'Pedro', costo_mano_obra: 45000, total: 45000, detalles: [], estado: 'entregado', paymentMethod: 'efectivo', campoAntiguo: 'se conserva en extra'});
  return {state, shops, f};
}
