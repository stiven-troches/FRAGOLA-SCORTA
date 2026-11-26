// Builds a realistic platform state through the real engine (platformRequest), for the
// import/verify/report tests. Fictitious data only; credentials live in memory.
// Covers: several companies, sales with labor and mechanics, partial returns, full
// cancellations, purchases and a cancelled purchase (cost replay), cash closures with a
// post-closure return, tickets with replies, customers (update + consent), drafts,
// terms, renewals (payments), and a legacy delivered workshop service.
import {qaPlatform, ok, DAY_D, DAY_D1, AT_D1, OWNER_PASSWORD} from '../tests/qa-fixture.mjs';

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

/**
 * Estado «rico» (DM-04 / DM-12): el de buildSampleState más una empresa («Taller Rico») que recorre
 * TODAS las colecciones que el modelo Postgres lleva con tabla propia: medios Nequi y Daviplata, pagos
 * divididos, crédito (venta fiada, abonos, cupo), saldo a favor, separados (abonos, entrega, cancelación
 * con reembolso y con saldo a favor), cotizaciones (convertida y anulada), garantías (devolución de dinero
 * y cambio con reclamo al proveedor), proveedores, órdenes de compra, compra a crédito con pagos al
 * proveedor, movimientos de caja, descuentos e IVA. Dos cierres de caja (días 20 y 21) y una devolución
 * posterior al cierre. Datos ficticios.
 */
export async function buildRichSampleState() {
  const {state: base, shops, f} = await buildSampleState();
  f.state = structuredClone(base); // incluye el servicio histórico que buildSampleState agrega al JSON
  const act = (actor, body) => f.act(actor, body);
  const shop = await f.shop('Taller Rico', {stock: 80, price: 34000});
  const {admin, seller} = shop;
  await act(admin, {type: 'settings.update', form: {maxSellerDiscountPct: 10, vat: {enabled: true, defaultRate: 19, pricesIncludeVat: true}}});
  await act(admin, {type: 'settings.update', form: {cotizaciones: {validDays: 7}}});
  let body = await act(admin, {type: 'business.change', payload: {kind: 'producto', form: {nombre: 'Aceite 20W50 Rico', referencia: 'AC-20W50', categoria: 'Lubricantes', marca: 'Motul', stock: 40, stock_minimo: 4,
    precio_compra: 18000, precio_venta: 30000, tarifa_iva: 5, garantia_dias: 30, precio_mecanico: 27000, precio_mayorista: 25000}}});
  const aceite = body.state.prods.find(p => p.nombre === 'Aceite 20W50 Rico'), producto = body.state.prods.find(p => p.id === shop.product.id);
  const item = (p, cantidad, extra = {}) => ({producto_id: p.id, cantidad, precio_unitario: p.precio_venta, ...extra});

  // Clientes: uno con cupo de crédito y otro sin cupo.
  body = await act(admin, {type: 'customer.create', form: {nombre: 'Carlos Crédito', telefono: '3105550101', tipoDocumento: 'CC', numeroDocumento: '1020304050', correo: 'carlos@example.invalid', tipo: 'mecanico', creditLimit: 400000, creditDays: 20, dataConsent: true}});
  const carlos = body.state.customerRecords.find(c => c.nombre === 'Carlos Crédito');
  body = await act(admin, {type: 'customer.create', form: {nombre: 'Laura Favor', telefono: '3105550202', dataConsent: true}});
  const laura = body.state.customerRecords.find(c => c.nombre === 'Laura Favor');

  // Caja del día: apertura, gasto del vendedor, retiro e ingreso.
  await act(admin, {type: 'cash.open', form: {amount: 100000}});
  await act(seller, {type: 'cash.expense', form: {amount: 8000, method: 'efectivo', motivo: 'Almuerzo del turno', categoria: 'alimentación'}});
  await act(admin, {type: 'cash.withdrawal', form: {amount: 20000, method: 'efectivo', motivo: 'Retiro del dueño'}});
  await act(admin, {type: 'cash.deposit', form: {amount: 15000, method: 'transferencia', motivo: 'Consignación de socio'}});

  // Ventas: Nequi, Daviplata, pago dividido, descuentos, crédito y mano de obra con IVA.
  const sales = {};
  const sale = async (key, actor, form, items, labor = []) => {
    const r = await act(actor, {type: 'sale.create', form, items, labor});
    sales[key] = r.receiptLink.saleId;
    return r;
  };
  await sale('nequi', seller, {cliente: 'Cliente general', paymentMethod: 'nequi'}, [item(producto, 1)]);
  await sale('daviplata', seller, {cliente: 'Cliente general', paymentMethod: 'daviplata'}, [item(aceite, 2)]);
  await sale('split', admin, {cliente: 'Pedro Dividido', telefono: '3105550303', dataConsent: true, efectivo_recibido: 50000,
    payments: [{method: 'efectivo', amount: 40000}, {method: 'tarjeta', amount: 30000}, {method: 'nequi', amount: 28000}]}, [item(producto, 2), item(aceite, 1)]);
  await sale('descuento', admin, {cliente: 'Descuento Pérez', paymentMethod: 'transferencia', descuento: {tipo: 'porcentaje', valor: 10}},
    [{producto_id: producto.id, cantidad: 3, precio: 34000, descuento: {tipo: 'valor', valor: 1000}}, item(aceite, 2)]);
  await sale('credito', admin, {customerId: carlos.id, payments: [{method: 'credito', amount: 60000}, {method: 'efectivo', amount: 8000}]}, [item(producto, 2)]);
  await sale('credito2', admin, {customerId: carlos.id, paymentMethod: 'credito'}, [{producto_id: aceite.id, cantidad: 4, precio_unitario: 27000}]);
  await sale('mano_obra', admin, {cliente: 'Luis Taller', placa: 'RIC12A', paymentMethod: 'daviplata', dataConsent: true}, [item(aceite, 1)],
    [{mecanicoId: shop.mechanic.id, descripcion: 'Cambio de aceite y filtro', importe: 35000}]);

  // Crédito: un abono con Nequi (se reparte entre las facturas pendientes).
  await act(seller, {type: 'credit.payment', form: {customerId: carlos.id, amount: 30000, method: 'nequi', nota: 'Abono parcial'}});

  // Separados: entregado, cancelado con saldo a favor y cancelado con reembolso.
  const layaway = async form => (await act(seller, {type: 'layaway.create', form})).state.layaways[0];
  const l1 = await layaway({customerId: laura.id, items: [{producto_id: aceite.id, cantidad: 2}], deposit: {amount: 20000, method: 'efectivo'}});
  await act(seller, {type: 'layaway.payment', id: l1.id, form: {amount: 10000, method: 'daviplata'}});
  const delivered = await act(seller, {type: 'layaway.deliver', id: l1.id, form: {payment: {amount: l1.total - 30000, method: 'tarjeta'}}});
  sales.separado = delivered.receiptLink.saleId;
  const l2 = await layaway({customerId: laura.id, dias: 5, items: [{producto_id: producto.id, cantidad: 1}], deposit: {amount: 12000, method: 'nequi'}});
  await act(admin, {type: 'layaway.cancel', id: l2.id, form: {motivo: 'Cambió de opinión', destino: 'saldo_a_favor'}});
  const l3 = await layaway({cliente: 'Marta Separa', telefono: '3105550404', dataConsent: true, items: [{producto_id: producto.id, cantidad: 1}], deposit: {amount: 9000, method: 'efectivo'}});
  await act(admin, {type: 'layaway.cancel', id: l3.id, form: {motivo: 'No volvió', destino: 'reembolso', method: 'daviplata'}});
  // Venta pagada con el saldo a favor de la cliente (más efectivo).
  await sale('favor', admin, {customerId: laura.id, payments: [{method: 'saldo_favor', amount: 12000}, {method: 'efectivo', amount: 22000}]}, [item(producto, 1)]);

  // Cotizaciones: una convertida en venta dividida y otra anulada.
  const quote1 = (await act(seller, {type: 'quote.create', form: {customerId: carlos.id, nota: 'Para el taller', items: [{producto_id: aceite.id, cantidad: 3, descuento: {tipo: 'porcentaje', valor: 5}}]}})).state.quotes[0];
  const converted = await act(admin, {type: 'quote.convert', id: quote1.id, form: {payments: [{method: 'nequi', amount: 40000}, {method: 'transferencia', amount: quote1.total - 40000}]}});
  sales.cotizacion = converted.document.id;
  const quote2 = (await act(admin, {type: 'quote.create', form: {cliente: 'Prospecto Sin Compra', telefono: '3105550505', dataConsent: true, dias: 10, items: [item(producto, 2)]}})).state.quotes[0];
  await act(admin, {type: 'quote.cancel', id: quote2.id, form: {motivo: 'Compró en otro lugar'}});

  // Proveedores, orden de compra con recepción a crédito y pagos al proveedor.
  const supplier = (await act(admin, {type: 'supplier.create', form: {nombre: 'Lubricantes del Valle', nit: '900111222-3', contacto: 'Marta Ríos', telefono: '3201234567', correo: 'ventas@example.invalid', plazoDias: 30}})).state.suppliers[0];
  let order = (await act(admin, {type: 'po.create', form: {supplierId: supplier.id, nota: 'Reposición', items: [{producto_id: aceite.id, cantidad: 10, costo: 18000}]}})).state.purchaseOrders[0];
  await act(admin, {type: 'po.send', id: order.id});
  await act(admin, {type: 'po.receive', id: order.id, form: {items: [{producto_id: aceite.id, cantidad: 6}], credito: true, factura: 'FV-881'}});
  await act(admin, {type: 'payable.payment', form: {supplierId: supplier.id, amount: 40000, method: 'efectivo', nota: 'Primer pago'}});
  await act(admin, {type: 'payable.payment', form: {supplierId: supplier.id, amount: 20000, method: 'nequi'}});
  order = (await act(admin, {type: 'po.create', form: {proveedor: 'Proveedor sin ficha', items: [{producto_id: producto.id, cantidad: 1}]}})).state.purchaseOrders[0];
  await act(admin, {type: 'po.cancel', id: order.id, form: {motivo: 'Duplicada'}});

  // Garantías: devolución de dinero por Nequi y cambio con reclamo al proveedor.
  await act(admin, {type: 'warranty.create', form: {saleId: sales.nequi, lineIndex: 0, cantidad: 1, motivo: 'No enciende', decision: 'devolucion', refundMethod: 'nequi'}});
  const warranty = (await act(seller, {type: 'warranty.create', form: {saleId: sales.daviplata, lineIndex: 0, cantidad: 1, motivo: 'Fuga de aceite', supplierId: supplier.id}})).state.warranties[0];
  await act(admin, {type: 'warranty.decide', id: warranty.id, form: {decision: 'cambio', nota: 'Se entrega otra unidad'}});
  await act(admin, {type: 'warranty.status', id: warranty.id, form: {estado: 'enviada', nota: 'Guía 123'}});
  await act(admin, {type: 'warranty.status', id: warranty.id, form: {estado: 'aprobada'}});
  await act(admin, {type: 'warranty.status', id: warranty.id, form: {estado: 'cerrada', resultado: 'reposicion'}});

  // Devolución parcial de la venta a crédito (primero baja el saldo) y de la dividida (reembolso por Tarjeta).
  await act(admin, {type: 'sale.reverse', id: sales.credito, form: {motivo: 'Devuelve una unidad', parcial: true}, items: [{index: 0, cantidad: 1}]});
  await act(admin, {type: 'sale.reverse', id: sales.split, form: {motivo: 'Devuelve el aceite', parcial: true, refundMethod: 'tarjeta'}, items: [{index: 1, cantidad: 1}]});
  await act(admin, {type: 'cash.close', form: {date: DAY_D1, actual: {efectivo: 0, transferencia: 0, tarjeta: 0, nequi: 0, daviplata: 0}, note: 'Cierre Taller Rico'}});

  // Día 21: abono, devolución de ventas del día cerrado (posterior al cierre) y cierre del día.
  f.setNow('2026-11-21T15:00:00.000Z');
  await f.login(admin, shop.company.slug, 'admin');
  await f.login(seller, shop.company.slug, 'vendedor');
  await act(seller, {type: 'credit.payment', form: {customerId: carlos.id, amount: 25000, method: 'efectivo'}});
  await act(admin, {type: 'sale.reverse', id: sales.mano_obra, form: {motivo: 'Cliente inconforme', parcial: false}, items: []});
  await act(admin, {type: 'sale.reverse', id: sales.descuento, form: {motivo: 'Devuelve uno', parcial: true, refundMethod: 'efectivo'}, items: [{index: 1, cantidad: 1}]});
  await sale('dia21', seller, {cliente: 'Cliente general', paymentMethod: 'efectivo'}, [item(producto, 1)]);
  await act(admin, {type: 'cash.close', form: {date: '2026-11-21', actual: {efectivo: 0, transferencia: 0, tarjeta: 0, nequi: 0, daviplata: 0}, note: 'Cierre día 21'}});

  return {state: structuredClone(f.state), shops, rich: {shop, sales, carlos, laura, aceite, producto, supplier, f}};
}
