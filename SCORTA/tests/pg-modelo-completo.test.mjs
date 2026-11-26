// DM-12: el modelo Postgres lleva TODO lo que la app guarda. Estado JSON realista (con crédito, separados,
// garantías, cotizaciones, pagos divididos, Nequi/Daviplata, IVA, descuentos, proveedores, órdenes de compra,
// caja) -> importar -> verificar -> exportar -> comparar sin pérdida; y el cierre de caja por medio de pago
// calculado en SQL cuadra con el de la app.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '../db/harness.mjs';
import {importPlatform, mapPlatformState, TABLE_COLUMNS} from '../db/import-json.mjs';
import {exportPlatform} from '../db/export-json.mjs';
import {diffStates} from '../db/compare-state.mjs';
import {cashChecksums, checksumsFromState, compareChecksums, verifyImport} from '../db/verify.mjs';
import {PostgresRepository} from '../db/repository.mjs';
import {buildRichSampleState} from '../db/sample-state.mjs';
import {cashBook} from '../caja-credito.mjs';
import {salesReport} from '../admin-reports.mjs';
import {roundMoney} from '../money.mjs';
import {DAY_D1} from './qa-fixture.mjs';

const rich = buildRichSampleState();
const NEW_TABLES = ['suppliers', 'purchase_credit', 'sale_payments', 'sale_vat_rates', 'sale_credit', 'reversal_refunds', 'cash_movements', 'credit_payments', 'credit_payment_applications',
  'layaways', 'layaway_lines', 'layaway_payments', 'quotes', 'quote_lines', 'warranties', 'warranty_history', 'purchase_orders', 'purchase_order_lines', 'purchase_order_receipts',
  'purchase_order_history', 'supplier_payments', 'supplier_payment_applications'];
const row = async (db, sql, params) => (await db.query(sql, params)).rows;

test('el estado rico llena cada tabla nueva y el importador la reparte sin dejar nada en business_extra', async () => {
  const {state, rich: {shop}} = await rich;
  const mapped = mapPlatformState(state);
  for (const table of NEW_TABLES) assert.ok(mapped[table].length > 0, `el estado de prueba no cubre ${table}`);
  for (const [table, rows] of Object.entries(mapped)) for (const r of rows) for (const key of Object.keys(r)) assert.ok(TABLE_COLUMNS[table].includes(key), `${table}.${key} sin columna`);
  // Ninguna colección del negocio queda en business_extra (antes: cashMovements, creditPayments, layaways, quotes...).
  for (const c of mapped.companies) assert.equal(c.business_extra, null, 'business_extra vacío para ' + c.name);
  // Medios de pago, pago dividido, IVA y descuentos tienen columna propia.
  const ventas = mapped.sales.filter(s => s.company_id === shop.company.id);
  const methods = new Set(mapped.sale_payments.filter(p => p.company_id === shop.company.id).map(p => p.method));
  assert.deepEqual([...methods].sort(), ['anticipo', 'credito', 'daviplata', 'efectivo', 'nequi', 'saldo_favor', 'tarjeta', 'transferencia']);
  assert.ok(ventas.some(s => s.iva_total > 0) && ventas.some(s => s.descuentos > 0) && ventas.some(s => s.efectivo_recibido === 50000));
  assert.ok(mapped.sale_credit.length >= 2 && mapped.layaway_payments.length >= 4);
});

test('round trip: importar -> verificar (0 diferencias) -> exportar -> comparar sin pérdida', async () => {
  const {state} = await rich;
  const {db, close} = await createTestDatabase();
  try {
    await importPlatform(db, state);
    const result = await verifyImport(db, state);
    assert.deepEqual(result.differences, []);
    for (const table of ['cash_movements', 'credit_payments', 'layaways', 'layaway_payments', 'quotes', 'warranties', 'suppliers', 'purchase_orders', 'supplier_payments', 'sale_payments',
      'reversal_refunds', 'purchase_credit', 'cash.book', 'cash.sales']) assert.ok(result.tables.includes(table), 'verify.mjs no cubre ' + table);
    const exported = await exportPlatform(db);
    assert.deepEqual(diffStates(state, exported), [], 'el JSON exportado debe ser igual al original');
    // Orden de los arreglos (más nuevo primero) y totales por empresa.
    for (const c of state.companies) {
      const original = state.businesses[c.id], back = exported.businesses[c.id];
      for (const key of ['ventas', 'compras', 'movimientos', 'quotes', 'layaways', 'creditPayments', 'cashMovements', 'warranties', 'purchaseOrders', 'supplierPayments'])
        assert.deepEqual((back[key] || []).map(x => x.id), (original[key] || []).map(x => x.id), `orden de ${key} en ${c.name}`);
    }
    // El exportado vuelve a importarse y verifica igual (la reversa de SQLite es posible).
    const again = await createTestDatabase();
    try {
      await importPlatform(again.db, exported);
      assert.deepEqual((await verifyImport(again.db, exported)).differences, []);
      assert.deepEqual(diffStates(exported, await exportPlatform(again.db)), []);
    } finally { await again.close(); }
  } finally { await close(); }
});

test('la verificación detecta alteraciones en las tablas nuevas, por empresa, tabla y fecha', async () => {
  const {state, rich: {shop, sales, carlos}} = await rich;
  const {db, close} = await createTestDatabase();
  const company = shop.company.id;
  try {
    await importPlatform(db, state);
    await db.query(`UPDATE cash_movements SET amount = amount + 1 WHERE company_id = $1 AND tipo = 'gasto' AND method = 'efectivo'`, [company]);
    await db.query(`UPDATE sale_payments SET amount = amount - 1000 WHERE company_id = $1 AND sale_id = $2 AND method = 'nequi'`, [company, sales.nequi]);
    await db.query(`UPDATE sale_credit SET saldo = saldo + 1 WHERE company_id = $1 AND sale_id = $2`, [company, sales.credito2]);
    await db.query(`UPDATE customers SET saldo_a_favor = 99 WHERE company_id = $1 AND id = $2`, [company, carlos.id]);
    await db.query(`UPDATE layaways SET saldo = saldo + 5 WHERE company_id = $1 AND estado = 'entregado'`, [company]);
    await db.query(`UPDATE quotes SET total = total + 7 WHERE company_id = $1 AND estado = 'anulada'`, [company]);
    await db.query(`DELETE FROM warranty_history WHERE company_id = $1 AND seq = 1`, [company]);
    await db.query(`UPDATE supplier_payments SET amount = amount + 3 WHERE company_id = $1 AND method = 'nequi'`, [company]);
    await db.query(`UPDATE reversal_refunds SET amount = amount + 2 WHERE company_id = $1 AND method = 'tarjeta'`, [company]);
    await db.query(`DELETE FROM purchase_credit WHERE company_id = $1`, [company]);
    const {differences} = await verifyImport(db, state);
    const tables = new Set(differences.map(d => d.table));
    for (const table of ['cash_movements', 'cash_movements.method', 'sale_payments', 'sales', 'customers', 'layaways', 'quotes', 'warranties', 'supplier_payments', 'reversal_refunds', 'purchase_credit', 'cash.book'])
      assert.ok(tables.has(table), 'no se detectó la alteración en ' + table);
    assert.ok(differences.every(d => d.company === company), 'solo la empresa alterada difiere');
    const find = (table, field) => differences.find(d => d.table === table && d.field === field);
    assert.equal(find('sale_credit', 'balance')?.dimension ?? find('sales', 'credit_balance').dimension, '2026-11-20');
    assert.equal(BigInt(find('cash.book', 'gastos').actual) - BigInt(find('cash.book', 'gastos').expected), 1n * 100n, 'el gasto en efectivo sube un peso en la caja del día 20');
    assert.equal(find('cash.book', 'gastos').dimension, '2026-11-20/efectivo');
  } finally { await close(); }
});

test('el cierre de caja por medio de pago calculado en SQL cuadra con el de la app', async () => {
  const {state, rich: {shop}} = await rich;
  const {db, close} = await createTestDatabase();
  try {
    await importPlatform(db, state);
    const business = state.businesses[shop.company.id], repo = new PostgresRepository(db).forCompany(shop.company.id);
    assert.equal(business.cashClosures.length, 2);
    const total = {};
    for (const closure of business.cashClosures) {
      const sql = (await repo.cashReport({date: closure.date})).days[closure.date];
      // Esperado por medio: el snapshot que guardó el cierre de la app == el libro de caja en SQL.
      for (const [method, expected] of Object.entries(closure.expected)) assert.equal(sql.expected[method] ?? 0, expected, `${closure.date} ${method}`);
      assert.deepEqual(sql.expected, cashBook(business, closure.date).expected, closure.date + ' contra cashBook()');
      assert.deepEqual(sql.rows, cashBook(business, closure.date).rows, closure.date + ' filas del libro');
      // ...y cada fila (base, ventas, abonos, separados, ingresos, gastos, retiros, devoluciones) es la del desglose que guardó el cierre.
      for (const [method, detail] of Object.entries(closure.breakdown)) {
        const {esperado, ...parts} = detail;
        assert.deepEqual(sql.rows[method] ?? {base: 0, ventas: 0, abonos: 0, separados: 0, ingresos: 0, gastos: 0, retiros: 0, devoluciones: 0}, parts, `${closure.date} ${method} desglose`);
        assert.equal(sql.expected[method] ?? 0, esperado);
      }
      total[closure.date] = sql;
    }
    // El día 20 mueve los cinco medios: base, ventas, abonos, separados, ingresos, gastos (con pago a proveedor), retiros y devoluciones.
    const d20 = total[DAY_D1];
    assert.deepEqual(Object.keys(d20.expected).sort(), ['daviplata', 'efectivo', 'nequi', 'tarjeta', 'transferencia']);
    assert.equal(d20.rows.efectivo.base, 100000);
    assert.equal(d20.rows.efectivo.gastos, 48000, 'gasto del vendedor 8.000 + pago a proveedor en efectivo 40.000');
    assert.equal(d20.rows.efectivo.retiros, 20000);
    assert.equal(d20.rows.transferencia.ingresos, 15000);
    assert.ok(d20.rows.nequi.ventas > 0 && d20.rows.daviplata.ventas > 0 && d20.rows.nequi.abonos === 30000 && d20.rows.nequi.separados === 12000);
    assert.equal(d20.rows.daviplata.separados, 10000);
    assert.equal(d20.rows.nequi.devoluciones, 34000, 'devolución por garantía pagada por Nequi');
    assert.ok(d20.rows.tarjeta.devoluciones === 30000 && d20.rows.daviplata.devoluciones === 9000, 'reembolso del separado cancelado y de la venta dividida');
    assert.ok(d20.creditSales > 0 && d20.layawaySales === 60000 && d20.favorSales === 12000, 'crédito, anticipo y saldo a favor no son dinero en caja');
    // Cada medio: esperado = base + ventas + abonos + separados + ingresos - gastos - retiros - devoluciones.
    for (const [method, r] of Object.entries(d20.rows)) assert.equal(d20.expected[method], roundMoney(r.base + r.ventas + r.abonos + r.separados + r.ingresos - r.gastos - r.retiros - r.devoluciones), method);
    // Día 21: la devolución de una venta de un día cerrado se descuenta de la caja de HOY (no reescribe el cierre del 20).
    const d21 = total['2026-11-21'];
    assert.equal(d21.rows.efectivo.abonos, 25000);
    assert.ok(d21.rows.daviplata.devoluciones > 0 && d21.rows.efectivo.devoluciones > 0);
    // La verificación completa también compara todos los días y todos los medios.
    const {expected, actual} = await cashChecksums(db, state);
    assert.deepEqual(compareChecksums(expected, actual), []);
    assert.ok(expected.size > 15, "se comparan todos los días y medios de las cuatro empresas");
  } finally { await close(); }
});

test('reporte de ventas SQL agrupa por sale_payments y coincide con admin-reports.mjs (pagos divididos, Nequi, Daviplata, crédito)', async () => {
  const {state, rich: {shop}} = await rich;
  const {db, close} = await createTestDatabase();
  try {
    await importPlatform(db, state);
    for (const company of state.companies) {
      const business = state.businesses[company.id], repo = new PostgresRepository(db).forCompany(company.id);
      for (const [from, to] of [['2026-10-01', '2026-11-30'], ['2026-11-20', '2026-11-20'], ['2026-11-21', '2026-11-21']]) {
        const expected = salesReport(business, {from, to}), actual = await repo.salesReport({from, to});
        assert.deepEqual(actual.paymentTotals, expected.paymentTotals, `${company.name} ${from}..${to}`);
        for (const key of ['count', 'gross', 'returns', 'cancellations', 'net']) assert.equal(actual.totals[key], expected.totals[key], `${key} ${company.name} ${from}..${to}`);
        assert.equal(actual.unknownPaymentCount, expected.unknownPaymentCount);
        assert.deepEqual(actual.credit, expected.credit, 'ventas a crédito, abonos y cartera');
        assert.equal(roundMoney(actual.days.reduce((sum, day) => sum + day.net, 0)), expected.totals.net, 'los netos por medio suman el neto total');
      }
    }
    const report = await new PostgresRepository(db).forCompany(shop.company.id).salesReport({from: '2026-11-20', to: '2026-11-20'});
    const byMethod = Object.fromEntries(report.days.map(d => [d.paymentMethod, d]));
    for (const method of ['efectivo', 'transferencia', 'tarjeta', 'nequi', 'daviplata', 'credito', 'anticipo', 'saldo_favor']) assert.ok(byMethod[method], 'falta el medio ' + method);
    assert.ok(report.totals.count < report.days.reduce((n, d) => n + d.count, 0), 'una venta con pago dividido cuenta en cada medio pero una sola vez en el total');
    assert.ok(report.credit.portfolio > 0);
  } finally { await close(); }
});

test('el repositorio vende con los medios reales: Nequi, Daviplata, pago dividido, crédito, saldo a favor, IVA y descuentos', async () => {
  const {db, close} = await createTestDatabase();
  try {
    await db.query(`INSERT INTO companies(id, name, slug, start_date, end_date, settings) VALUES('e1', 'E1', 'e1', '2026-11-01', '2026-12-31', '{"caja": {"creditDays": 10}}')`);
    await db.query(`INSERT INTO products(company_id, id, nombre, search_text, precio_compra, precio_venta, stock, tarifa_iva) VALUES('e1', 'p1', 'Aceite', 'aceite', 10000, 30000, 100, 5), ('e1', 'p2', 'Filtro', 'filtro', 5000, 20000, 100, NULL)`);
    await db.query(`INSERT INTO customers(company_id, id, nombre, credit_limit, saldo_a_favor) VALUES('e1', 'c1', 'Cliente Uno', 100000, 15000), ('e1', 'c2', 'Cliente Dos', NULL, NULL)`);
    const repo = new PostgresRepository(db).forCompany('e1'), base = {fecha: '2026-11-21', now: '2026-11-21T15:00:00.000Z', usuario: 'u', userId: 'u1'};
    const sell = (extra, items = [{producto_id: 'p1', cantidad: 1, precio_unitario: 30000}]) => repo.createSale({...base, items, ...extra});

    for (const method of ['nequi', 'daviplata', 'efectivo']) assert.equal((await sell({paymentMethod: method})).sale.payments[0].method, method);
    await assert.rejects(sell({paymentMethod: 'cheque'}), /Nequi o Daviplata/);
    await assert.rejects(sell({paymentMethod: 'anticipo'}), /Nequi o Daviplata/, 'el anticipo solo nace de entregar un separado');
    // Pago dividido: la suma debe ser el total.
    const split = await sell({payments: [{method: 'efectivo', amount: 20000}, {method: 'nequi', amount: 10000}, {method: 'tarjeta', amount: 20000}], efectivoRecibido: 25000},
      [{producto_id: 'p1', cantidad: 1, precio_unitario: 30000}, {producto_id: 'p2', cantidad: 1, precio_unitario: 20000}]);
    assert.equal(split.sale.payment_method, 'efectivo', 'el medio principal es el de mayor monto');
    const stored = await repo.getSale(split.sale.id);
    assert.deepEqual(stored.payments.map(p => [p.method, p.amount]), [['efectivo', '20000.00'], ['nequi', '10000.00'], ['tarjeta', '20000.00']]);
    assert.equal(stored.efectivo_recibido, '25000.00');
    assert.equal(stored.vueltas, '5000.00');
    await assert.rejects(sell({payments: [{method: 'efectivo', amount: 1000}]}), /Los pagos suman/);
    // Crédito: cupo, plazo de la empresa (10 días) y saldo.
    await assert.rejects(sell({paymentMethod: 'credito'}), error => error.code === 'CUSTOMER_REQUIRED');
    await assert.rejects(sell({paymentMethod: 'credito', customerId: 'c2'}), error => error.code === 'CREDIT_LIMIT', 'sin cupo no hay crédito');
    const credit = await sell({payments: [{method: 'credito', amount: 25000}, {method: 'efectivo', amount: 5000}], customerId: 'c1'});
    assert.deepEqual((await repo.getSale(credit.sale.id)).credito, {monto: '25000.00', saldo: '25000.00', pagado: '0.00', plazo_dias: 10, vence: '2026-12-01'});
    await assert.rejects(sell({paymentMethod: 'credito', customerId: 'c1'}, [{producto_id: 'p1', cantidad: 3, precio_unitario: 30000}]), error => error.code === 'CREDIT_LIMIT');
    assert.equal((await sell({paymentMethod: 'credito', customerId: 'c1', allowOverCreditLimit: true}, [{producto_id: 'p1', cantidad: 3, precio_unitario: 30000}])).replayed, false, 'el administrador puede superar el cupo');
    // Saldo a favor: se descuenta del cliente de forma atómica.
    await assert.rejects(sell({payments: [{method: 'saldo_favor', amount: 30000}], customerId: 'c1'}), error => error.code === 'FAVOR_INSUFFICIENT');
    await sell({payments: [{method: 'saldo_favor', amount: 10000}, {method: 'efectivo', amount: 20000}], customerId: 'c1'});
    assert.equal((await row(db, `SELECT saldo_a_favor FROM customers WHERE company_id = 'e1' AND id = 'c1'`))[0].saldo_a_favor, '5000.00');
    // IVA y descuentos: columnas propias y tarifas por renglón (producto al 5 %, el otro a la tarifa general 19 %).
    const vat = await sell({paymentMethod: 'transferencia', iva: {preciosCatalogoConIva: true, defaultRate: 19}, descuentoTotal: 1000},
      [{producto_id: 'p1', cantidad: 2, precio_unitario: 27000, precio_lista: 30000, descuento: 3000}, {producto_id: 'p2', cantidad: 1, precio_unitario: 20000, precio_lista: 20000, descuento: 0}]);
    const saleRow = (await row(db, `SELECT descuentos, descuento_total, iva_incluido, iva_total FROM sales WHERE company_id = 'e1' AND id = $1`, [vat.sale.id]))[0];
    assert.equal(saleRow.descuentos, '6000.00');
    assert.equal(saleRow.descuento_total, '1000.00');
    assert.equal(saleRow.iva_incluido, true);
    const rates = await row(db, `SELECT tarifa::float8 AS tarifa, base, iva, total FROM sale_vat_rates WHERE company_id = 'e1' AND sale_id = $1 ORDER BY tarifa`, [vat.sale.id]);
    assert.deepEqual(rates.map(r => [r.tarifa, r.total]), [[5, '54000.00'], [19, '20000.00']]);
    assert.equal(rates[0].base, '51428.57');
    assert.equal(saleRow.iva_total, String(roundMoney(Number(rates[0].iva) + Number(rates[1].iva)).toFixed(2)));
    const line = (await row(db, `SELECT precio_lista, descuento, tarifa_iva FROM sale_lines WHERE company_id = 'e1' AND sale_id = $1 ORDER BY line_no`, [vat.sale.id]));
    assert.deepEqual(line[0], {precio_lista: '30000.00', descuento: '3000.00', tarifa_iva: '5.00'});
    // El reporte y la caja agrupan por medio real.
    const report = await repo.salesReport({from: '2026-11-21', to: '2026-11-21'}), cash = (await repo.cashReport({date: '2026-11-21'})).days['2026-11-21'];
    assert.ok(report.paymentTotals.nequi >= 40000 && report.paymentTotals.daviplata === 30000 && report.paymentTotals.credito > 0 && report.paymentTotals.saldo_favor === 10000);
    assert.equal(cash.rows.nequi.ventas, report.paymentTotals.nequi);
    assert.equal(cash.rows.daviplata.ventas, 30000);
    assert.ok(cash.creditSales >= 25000 && cash.favorSales === 10000);
    assert.equal(cash.rows.tarjeta.ventas, 20000);
    // Cada venta guardó su pago: el total de pagos por medio es el total de las ventas.
    assert.equal(roundMoney(Number((await row(db, `SELECT sum(amount) AS n FROM sale_payment_lines WHERE company_id = 'e1'`))[0].n)),
      roundMoney(Number((await row(db, `SELECT sum(total) AS n FROM sales WHERE company_id = 'e1'`))[0].n)));
  } finally { await close(); }
});

test('datos antiguos y desconocidos viajan intactos: reversiones sin reembolso, pagos inválidos, días como marca de tiempo, campos nuevos', async () => {
  const {state, rich: {shop}} = await rich;
  const altered = structuredClone(state), business = altered.businesses[shop.company.id];
  // Reversión antigua (antes de BE-15): sin `reembolso`. El importador reconstruye el reembolso como la app y no lo exporta.
  const reversed = business.ventas.find(s => (s.reversiones || []).some(r => r.reembolso && !r.garantiaId));
  for (const r of reversed.reversiones) delete r.reembolso;
  const norte = Object.values(altered.businesses).find(b => b !== business && b.ventas.some(s => (s.reversiones || []).length));
  for (const sale of norte.ventas) for (const r of sale.reversiones || []) delete r.reembolso;
  const {db, close} = await createTestDatabase();
  try {
    await importPlatform(db, altered);
    assert.ok((await row(db, 'SELECT count(*)::int AS n FROM reversals WHERE refund_derived'))[0].n >= 2, 'reembolsos reconstruidos');
    assert.deepEqual((await verifyImport(db, altered)).differences, [], 'el libro de caja en SQL cuadra con cashBook() aun con reversiones antiguas');
    assert.deepEqual(diffStates(altered, await exportPlatform(db)), [], 'lo reconstruido no se escribe de vuelta');
  } finally { await close(); }

  const weird = structuredClone(state), wb = weird.businesses[shop.company.id];
  wb.quotes[0].campoNuevo = {a: 1}; wb.quotes[0].iva.extraIva = 'x'; wb.quotes[0].detalles[0].lote = 'L-9';
  wb.layaways[0].campoNuevo = [1, 2]; wb.layaways.find(l => l.cancelacion).cancelacion.extraCancel = true; wb.layaways[0].abonos[0].canal = 'caja 2';
  wb.warranties[0].campoNuevo = 'w'; wb.warranties[0].historial[0].via = 'web'; wb.suppliers[0].rut = '123'; wb.purchaseOrders[0].campoNuevo = 1; wb.purchaseOrders[0].items[0].lote = 'A';
  wb.cashMovements[0].caja = 2; wb.creditPayments[0].campoNuevo = 'c'; wb.creditPayments[0].aplicado[0].nota = 'n'; wb.supplierPayments[0].campoNuevo = 's';
  wb.cashMovements[1].fecha = '2026-11-20T15:00:00.000Z';                      // marca de tiempo en una columna de día
  wb.settings.nuevaOpcion = {x: 1}; wb.secuencias.nuevo = 5; wb.campoNegocio = {z: 1};
  const sale = wb.ventas.find(s => s.payments?.length === 3);
  sale.payments.push({method: 'cheque', amount: 5}); sale.iva.extraIva = 1; sale.credito = {monto: 1, saldo: 1, pagado: 0, plazoDias: 5, vence: '2026-12-01', cuotas: 2};
  sale.detalles[0].lote = 'L-1'; sale.detalles[0].descuento = 12.5;
  wb.prods[0].campoNuevo = 'p'; wb.prods[0].precios = {mecanico: 1, mostrador: 2, vip: 3};
  const exact = await createTestDatabase();
  try {
    await importPlatform(exact.db, weird);
    assert.deepEqual(diffStates(weird, await exportPlatform(exact.db)), []);
    const stored = (await row(exact.db, `SELECT extra FROM sales WHERE company_id = $1 AND id = $2`, [shop.company.id, sale.id]))[0].extra;
    assert.equal(stored.payments_raw.length, 4, 'la lista de pagos con un medio inválido se conserva completa');
    assert.equal((await row(exact.db, `SELECT count(*)::int AS n FROM cash_movements WHERE company_id = $1 AND fecha = '2026-11-20'`, [shop.company.id]))[0].n >= 2, true, 'la marca de tiempo pasó a su día de Bogotá');
  } finally { await exact.close(); }
});

test('verify.mjs: sumas de control del estado cubren las colecciones nuevas', async () => {
  const {state, rich: {shop}} = await rich;
  const sums = checksumsFromState(state), key = (table, dim) => sums.get(`${shop.company.id}|${table}|${dim}`);
  assert.equal(key('suppliers', '*').count, 1n);
  assert.equal(key('quotes', 'convertida').count, 1n);
  assert.equal(key('quotes', 'anulada').count, 1n);
  assert.equal(key('layaways', 'entregado').count, 1n);
  assert.equal(key('layaways', 'cancelado').count, 2n);
  assert.equal(key('purchase_orders', 'anulada').count, 1n);
  assert.equal(key('supplier_payments', '2026-11-20/nequi').amount, 2000000n);
  assert.equal(key('credit_payments', '2026-11-20/nequi').amount, 3000000n);
  assert.ok(key('sale_payments', '2026-11-20/nequi').count >= 3n);
  assert.equal(key('customers', '*').favor, 0n, 'el saldo a favor de Laura se gastó en una venta');
  assert.ok(key('purchase_credit', '*').balance > 0n);
});
