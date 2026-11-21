// BE-24 / BE-27 / BE-28 / BE-31 / DM-06: repositorio Postgres (sin conectar a la app).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '../db/harness.mjs';
import {importPlatform} from '../db/import-json.mjs';
import {PostgresRepository} from '../db/repository.mjs';
import {generateSynthetic, measure} from '../db/synthetic.mjs';
import {buildSampleState} from '../db/sample-state.mjs';
import {salesReport} from '../admin-reports.mjs';

const NOW = '2026-11-21T15:00:00.000Z', TODAY = '2026-11-21';
let ctx;
test.before(async () => {
  const {state, shops} = await buildSampleState();
  const database = await createTestDatabase({max: 4});
  await importPlatform(database.db, state);
  ctx = {...database, state, shops, repo: new PostgresRepository(database.db)};
});
test.after(() => ctx?.close());

const stockOf = async (companyId, id) => (await ctx.db.query('SELECT stock FROM products WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0].stock;
const addProduct = async (companyId, id, stock, nombre = 'Producto ' + id) => ctx.db.query(`INSERT INTO products(company_id, id, nombre, search_text, precio_compra, precio_venta, stock)
  VALUES($1, $2, $3, lower($3), 1000, 2000, $4)`, [companyId, id, nombre, stock]);

test('búsqueda de productos por texto, sin tildes, paginada y sin costo por defecto', async () => {
  const shop = ctx.shops[0], repo = ctx.repo.forCompany(shop.company.id);
  let page = await repo.searchProducts({q: 'BUJIA'});
  assert.deepEqual(page.items.map(p => p.id), [shop.bujia.id]);
  assert.equal(page.items[0].precio_compra, undefined);
  page = await repo.searchProducts({q: 'freno yamaha', includeCost: true});
  assert.equal(page.items[0].id, shop.pastillas.id);
  assert.equal(page.items[0].precio_compra, 22000);
  assert.equal((await repo.searchProducts({q: shop.filtro.referencia.toLowerCase()})).items[0].id, shop.filtro.id);
  assert.deepEqual((await repo.searchProducts({q: '100%_'})).items, [], 'comodines escapados');
  const all = [];
  let next = null;
  do { const r = await repo.searchProducts({limit: 2, after: next}); all.push(...r.items); next = r.next; } while (next);
  assert.equal(all.length, 4);
  assert.deepEqual(all.map(p => p.nombre.toLowerCase()), all.map(p => p.nombre.toLowerCase()).sort());
});

test('listar ventas paginado por fechas, más recientes primero', async () => {
  const shop = ctx.shops[0], repo = ctx.repo.forCompany(shop.company.id);
  const first = await repo.listSales({from: '2026-11-19', to: '2026-11-20', limit: 2});
  assert.equal(first.items.length, 2);
  assert.ok(first.next);
  const rest = await repo.listSales({from: '2026-11-19', to: '2026-11-20', limit: 100, before: first.next});
  const ids = [...first.items, ...rest.items].map(s => s.id);
  assert.equal(new Set(ids).size, 5);
  assert.equal(rest.next, null);
  assert.equal([...first.items, ...rest.items][0].fecha, '2026-11-20');
  assert.ok(first.items.every(s => Array.isArray(s.detalles)));
  assert.equal((await repo.listSales({from: '2026-11-20', to: '2026-11-20'})).items.length, 1);
  await assert.rejects(repo.listSales({from: '2026-02-30'}), /fecha inválida/);
});

test('crear venta en una transacción: stock, líneas, mano de obra, movimientos y auditoría', async () => {
  const shop = ctx.shops[1], repo = ctx.repo.forCompany(shop.company.id), before = await stockOf(shop.company.id, shop.filtro.id);
  const {sale} = await repo.createSale({fecha: TODAY, now: NOW, usuario: 'admin', userId: 'u1', paymentMethod: 'tarjeta', placa: 'QWE12R',
    items: [{producto_id: shop.filtro.id, cantidad: 2, precio_unitario: 15000.5}, {producto_id: shop.filtro.id, cantidad: 1, precio_unitario: 15000.5}],
    labor: [{mecanicoId: shop.mechanic.id, descripcion: 'Cambio de aceite', importe: 20000}]});
  assert.equal(sale.total, 65001.5);
  assert.equal(await stockOf(shop.company.id, shop.filtro.id), before - 3);
  const stored = await repo.getSale(sale.id);
  assert.equal(stored.detalles.length, 2);
  assert.equal(stored.labor[0].mecanico_porcentaje, '50.00');
  assert.equal(stored.created_at, NOW);
  const movement = (await ctx.db.query('SELECT * FROM stock_movements WHERE company_id = $1 AND documento = $2', [shop.company.id, sale.id])).rows;
  assert.equal(movement.length, 1);
  assert.equal(movement[0].cantidad, -3);
  assert.equal(movement[0].fecha_comercial, TODAY);
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM audit_log WHERE company_id = $1 AND documento = $2 AND accion = 'venta'`, [shop.company.id, sale.id])).rows[0].n, 1);
});

test('stock insuficiente revierte toda la venta', async () => {
  const shop = ctx.shops[1], repo = ctx.repo.forCompany(shop.company.id);
  const filtro = await stockOf(shop.company.id, shop.filtro.id), pastillas = await stockOf(shop.company.id, shop.pastillas.id);
  await assert.rejects(repo.createSale({fecha: TODAY, now: NOW, paymentMethod: 'efectivo', items: [
    {producto_id: shop.filtro.id, cantidad: 1, precio_unitario: 1}, {producto_id: shop.pastillas.id, cantidad: pastillas + 1, precio_unitario: 1}]}),
  error => error.code === 'STOCK_INSUFFICIENT');
  assert.equal(await stockOf(shop.company.id, shop.filtro.id), filtro);
  await assert.rejects(repo.createSale({fecha: TODAY, now: NOW, paymentMethod: 'efectivo', items: [{producto_id: 'no-existe', cantidad: 1, precio_unitario: 1}]}), error => error.code === 'PRODUCT_NOT_FOUND');
  await assert.rejects(repo.createSale({fecha: TODAY, now: NOW, paymentMethod: 'cheque', items: [{producto_id: shop.filtro.id, cantidad: 1, precio_unitario: 1}]}), /efectivo, transferencia o tarjeta/);
  await assert.rejects(repo.createSale({fecha: '2026-11-19', now: NOW, paymentMethod: 'efectivo', items: [{producto_id: shop.filtro.id, cantidad: 1, precio_unitario: 1}]}), error => error.code === 'CASH_ALREADY_CLOSED');
});

test('concurrencia (BE-27): dos ventas por la última unidad y solo pasa una', async () => {
  const shop = ctx.shops[2], companyId = shop.company.id, repo = ctx.repo.forCompany(companyId);
  await addProduct(companyId, 'ultima-unidad', 1);
  const sell = n => repo.createSale({fecha: TODAY, now: NOW, usuario: 'caja' + n, paymentMethod: 'efectivo', items: [{producto_id: 'ultima-unidad', cantidad: 1, precio_unitario: 2000}]});
  const results = await Promise.allSettled([sell(1), sell(2)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'STOCK_INSUFFICIENT');
  assert.equal(await stockOf(companyId, 'ultima-unidad'), 0);
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM sale_lines WHERE company_id = $1 AND producto_id = 'ultima-unidad'`, [companyId])).rows[0].n, 1);
  // Diez cajas a la vez sobre 4 unidades: exactamente 4 ventas.
  await addProduct(companyId, 'cuatro-unidades', 4);
  const many = await Promise.allSettled(Array.from({length: 10}, (_, n) => repo.createSale({fecha: TODAY, now: NOW, usuario: 'caja' + n, paymentMethod: 'efectivo',
    items: [{producto_id: 'cuatro-unidades', cantidad: 1, precio_unitario: 2000}]})));
  assert.equal(many.filter(r => r.status === 'fulfilled').length, 4);
  assert.equal(await stockOf(companyId, 'cuatro-unidades'), 0);
});

test('idempotencia con INSERT ... ON CONFLICT: reintento devuelve la misma venta', async () => {
  const shop = ctx.shops[2], companyId = shop.company.id, repo = ctx.repo.forCompany(companyId);
  await addProduct(companyId, 'idem', 10);
  const body = {fecha: TODAY, now: NOW, userId: 'u-idem', requestId: 'req-1', fingerprint: 'abc', paymentMethod: 'efectivo', items: [{producto_id: 'idem', cantidad: 1, precio_unitario: 2000}]};
  const [a, b] = await Promise.all([repo.createSale(body), repo.createSale(body)]);
  assert.deepEqual([a.replayed, b.replayed].sort(), [false, true]);
  assert.equal(a.sale.id, b.sale.id);
  assert.equal(await stockOf(companyId, 'idem'), 9);
  await assert.rejects(repo.createSale({...body, fingerprint: 'otro'}), error => error.code === 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await ctx.repo.claimRequest({userId: 'owner', requestId: 'x', fingerprint: 'f'}), {status: 'new', result: null});
  assert.equal((await ctx.repo.claimRequest({userId: 'owner', requestId: 'x', fingerprint: 'f'})).status, 'replay');
});

test('reporte por día y medio de pago en SQL coincide con admin-reports.mjs (DM-06)', async () => {
  for (const shop of ctx.shops) {
    const business = ctx.state.businesses[shop.company.id];
    for (const [from, to] of [['2026-11-19', '2026-11-19'], ['2026-11-20', '2026-11-20'], ['2026-10-01', '2026-11-20']]) {
      const expected = salesReport(business, {from, to}), actual = await ctx.repo.forCompany(shop.company.id).salesReport({from, to});
      assert.deepEqual(actual.paymentTotals, expected.paymentTotals, `${shop.company.name} ${from}..${to}`);
      for (const key of ['gross', 'returns', 'cancellations', 'net']) assert.equal(actual.totals[key], expected.totals[key], `${key} ${shop.company.name} ${from}..${to}`);
      assert.equal(actual.totals.count, expected.totals.count);
    }
  }
  // El servicio histórico entregado (sin venta) cuenta en su día de entrega.
  const legacy = await ctx.repo.forCompany(ctx.shops[2].company.id).salesReport({from: '2026-11-02', to: '2026-11-02'});
  assert.deepEqual(legacy.days.map(d => [d.paymentMethod, d.net]), [['efectivo', 45000]]);
});

test('sesiones y límites de intentos en la base (BE-31)', async () => {
  const owner = (await ctx.db.query(`SELECT id, version FROM users WHERE role = 'owner'`)).rows[0];
  const admin = (await ctx.db.query(`SELECT id, version, company_id FROM users WHERE role = 'admin' LIMIT 1`)).rows[0];
  await ctx.repo.createSession({tokenHash: 'h-owner', userId: owner.id, userVersion: owner.version, expiresAt: '2026-11-22T00:00:00Z', support: {companyId: admin.company_id, reason: 'Soporte', startedAt: NOW}});
  await ctx.repo.createSession({tokenHash: 'h-admin', userId: admin.id, userVersion: admin.version, expiresAt: '2026-11-22T00:00:00Z'});
  const session = await ctx.repo.getSession('h-owner', NOW);
  assert.equal(session.role, 'owner');
  assert.equal(session.support_company_id, admin.company_id);
  assert.equal(await ctx.repo.getSession('h-owner', '2026-11-23T00:00:00Z'), null, 'vencida');
  await ctx.db.query('UPDATE users SET version = version + 1 WHERE id = $1', [admin.id]);
  assert.equal(await ctx.repo.getSession('h-admin', NOW), null, 'versión de usuario cambiada');
  assert.equal(await ctx.repo.revokeSessions({companyId: admin.company_id, exceptTokenHash: 'h-none'}) >= 2, true);
  assert.equal(await ctx.repo.getSession('h-owner', NOW), null);
  const hit = () => ctx.repo.hitThrottle({kind: 'login', key: 'k1', windowMs: 60000, now: NOW});
  assert.equal((await hit()).count, 1);
  assert.equal((await hit()).count, 2);
  assert.equal((await ctx.repo.hitThrottle({kind: 'login', key: 'k1', windowMs: 60000, now: '2026-11-21T16:00:00Z'})).count, 1, 'ventana nueva');
  await ctx.repo.clearThrottle('login', 'k1');
  assert.equal((await hit()).count, 1);
  assert.ok(await ctx.repo.purgeExpiredSessions('2030-01-01T00:00:00Z') >= 0);
});

test('generador sintético y medición a escala pequeña', async () => {
  const generated = await generateSynthetic(ctx.db, {companies: 2, products: 200, months: 1, salesPerDay: 5, prefix: 'tst'});
  assert.equal(generated.counts.products, 400);
  assert.equal(generated.counts.sales, 300);
  assert.equal(generated.counts.stock_movements, generated.counts.sale_lines);
  const results = await measure(ctx.db, {ids: generated.ids, endDate: generated.endDate, products: 200, samples: 3, warmup: 1});
  for (const key of ['search', 'createSale', 'listSales', 'report30']) assert.ok(results[key].p50 >= 0 && results[key].p95 >= results[key].p50);
  await assert.rejects(generateSynthetic(ctx.db, {companies: 1, products: 1, months: 1, salesPerDay: 1, prefix: 'tst'}), /Ya existen/);
});
