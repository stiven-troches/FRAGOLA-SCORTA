// SEG-12: aislamiento entre empresas. El repositorio de la empresa A nunca lee ni
// escribe datos de la empresa B, aunque comparta ids de producto o conozca ids de B;
// y la base rechaza por sí misma filas hijas que crucen empresas (FK compuestas).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '../db/harness.mjs';
import {PostgresRepository} from '../db/repository.mjs';

const NOW = '2026-11-21T15:00:00.000Z', TODAY = '2026-11-21';
let ctx;
test.before(async () => {
  const database = await createTestDatabase();
  const {db} = database;
  for (const id of ['emp-a', 'emp-b']) {
    await db.query(`INSERT INTO companies(id, name, slug, start_date, end_date) VALUES($1, $1, $1, '2026-11-01', '2026-12-31')`, [id]);
    await db.query(`INSERT INTO mechanics(company_id, id, name, percentage) VALUES($1, 'mec-' || $1, 'Mecánico ' || $1, 40)`, [id]);
    await db.query(`INSERT INTO customers(company_id, id, nombre, telefono) VALUES($1, 'cli-' || $1, 'Cliente ' || $1, '300' || length($1))`, [id]);
    // Mismo id de producto en ambas empresas, con nombres distintos.
    await db.query(`INSERT INTO products(company_id, id, nombre, search_text, precio_compra, precio_venta, stock)
      VALUES($1, 'p-compartido', 'Filtro ' || $1, lower('filtro ' || $1), 1000, 2000, 10),
            ($1, 'p-solo-' || $1, 'Cadena ' || $1, lower('cadena ' || $1), 1000, 3000, 5)`, [id]);
    await db.query(`INSERT INTO cash_closures(company_id, id, date, created_at, expected_total, actual_total, difference_total, expected, actual, differences)
      VALUES($1, 'cierre-' || $1, CASE WHEN $1 = 'emp-b' THEN DATE '2026-11-20' ELSE DATE '2026-11-18' END, now(), 0, 0, 0, '{}', '{}', '{}')`, [id]);
  }
  const repo = new PostgresRepository(db);
  const saleB = (await repo.forCompany('emp-b').createSale({fecha: TODAY, now: NOW, userId: 'u-b', paymentMethod: 'tarjeta',
    items: [{producto_id: 'p-compartido', cantidad: 1, precio_unitario: 2000}]})).sale;
  ctx = {...database, repo, A: repo.forCompany('emp-a'), B: repo.forCompany('emp-b'), saleB};
});
test.after(() => ctx?.close());

const stock = async (company, id) => (await ctx.db.query('SELECT stock FROM products WHERE company_id = $1 AND id = $2', [company, id])).rows[0].stock;

test('sin company_id no hay repositorio de negocio', () => {
  for (const value of [undefined, null, '', '  ', 42]) assert.throws(() => ctx.repo.forCompany(value), error => error.code === 'COMPANY_REQUIRED');
});

test('A no lee productos ni ventas de B', async () => {
  const products = await ctx.A.searchProducts({q: '', limit: 200});
  assert.deepEqual(products.items.map(p => p.nombre).sort(), ['Cadena emp-a', 'Filtro emp-a']);
  assert.deepEqual((await ctx.A.searchProducts({q: 'emp-b'})).items, []);
  assert.equal(await ctx.A.getProduct('p-solo-emp-b'), null);
  assert.equal((await ctx.A.getProduct('p-compartido')).nombre, 'Filtro emp-a');
  assert.deepEqual((await ctx.A.listSales({})).items, []);
  assert.equal(await ctx.A.getSale(ctx.saleB.id), null);
  const report = await ctx.A.salesReport({from: '2026-11-01', to: '2026-11-30'});
  assert.equal(report.totals.count, 0);
  assert.equal((await ctx.B.salesReport({from: '2026-11-01', to: '2026-11-30'})).totals.gross, 2000);
});

test('A no escribe en B: ni con el mismo id de producto ni con un id exclusivo de B', async () => {
  const beforeB = await stock('emp-b', 'p-compartido');
  const {sale} = await ctx.A.createSale({fecha: TODAY, now: NOW, userId: 'u-a', paymentMethod: 'efectivo', items: [{producto_id: 'p-compartido', cantidad: 2, precio_unitario: 2000}]});
  assert.equal(await stock('emp-a', 'p-compartido'), 8);
  assert.equal(await stock('emp-b', 'p-compartido'), beforeB, 'el stock de B no cambia');
  assert.equal((await ctx.A.getSale(sale.id)).detalles[0].nombre, 'Filtro emp-a');
  await assert.rejects(ctx.A.createSale({fecha: TODAY, now: NOW, paymentMethod: 'efectivo', items: [{producto_id: 'p-solo-emp-b', cantidad: 1, precio_unitario: 1}]}),
    error => error.code === 'PRODUCT_NOT_FOUND');
  assert.equal(await stock('emp-b', 'p-solo-emp-b'), 5);
  // El mecánico de B no sirve en una venta de A.
  await assert.rejects(ctx.A.createSale({fecha: TODAY, now: NOW, placa: 'ABC12D', paymentMethod: 'efectivo', items: [],
    labor: [{mecanicoId: 'mec-emp-b', descripcion: 'Trabajo', importe: 1000}]}), error => error.code === 'INVALID_MECHANIC');
  // El cierre de caja de B no bloquea ese día en A, y el de A sí.
  await ctx.A.createSale({fecha: '2026-11-20', now: NOW, paymentMethod: 'efectivo', items: [{producto_id: 'p-solo-emp-a', cantidad: 1, precio_unitario: 3000}]});
  await assert.rejects(ctx.A.createSale({fecha: '2026-11-18', now: NOW, paymentMethod: 'efectivo', items: [{producto_id: 'p-solo-emp-a', cantidad: 1, precio_unitario: 3000}]}),
    error => error.code === 'CASH_ALREADY_CLOSED');
  // Un cliente de B no puede asociarse a una venta de A (FK compuesta).
  await assert.rejects(ctx.A.createSale({fecha: TODAY, now: NOW, customerId: 'cli-emp-b', paymentMethod: 'efectivo', items: [{producto_id: 'p-solo-emp-a', cantidad: 1, precio_unitario: 3000}]}),
    /foreign key|llave foránea/i);
  assert.equal((await ctx.B.listSales({})).items.length, 1, 'B sigue con su única venta');
});

test('la base rechaza filas hijas que cruzan empresas (claves foráneas compuestas)', async () => {
  const fk = /foreign key|llave foránea/i;
  await assert.rejects(ctx.db.query(`INSERT INTO sale_lines(company_id, sale_id, line_no, producto_id, nombre, cantidad, precio_unitario)
    VALUES('emp-a', $1, 9, 'p-compartido', 'X', 1, 1)`, [ctx.saleB.id]), fk);
  await assert.rejects(ctx.db.query(`INSERT INTO receipts(token_hash, company_id, sale_id, expires_at) VALUES('h1', 'emp-a', $1, now())`, [ctx.saleB.id]), fk);
  await assert.rejects(ctx.db.query(`INSERT INTO product_cost_history(company_id, product_id, seq, kind) VALUES('emp-a', 'p-solo-emp-b', 0, 'baseline')`), fk);
  await assert.rejects(ctx.db.query(`INSERT INTO services(company_id, id, venta_id, fecha, estado) VALUES('emp-a', 'srv', $1, '2026-11-21', 'completado')`, [ctx.saleB.id]), fk);
});

test('idempotencia: el mismo requestId en dos empresas no se mezcla entre usuarios distintos', async () => {
  const body = {fecha: TODAY, now: NOW, requestId: 'req-igual', fingerprint: 'f', paymentMethod: 'efectivo'};
  const a = await ctx.A.createSale({...body, userId: 'u-a', items: [{producto_id: 'p-solo-emp-a', cantidad: 1, precio_unitario: 3000}]});
  const b = await ctx.B.createSale({...body, userId: 'u-b', items: [{producto_id: 'p-solo-emp-b', cantidad: 1, precio_unitario: 3000}]});
  assert.equal(a.replayed, false);
  assert.equal(b.replayed, false);
  assert.notEqual(a.sale.id, b.sale.id);
  assert.equal(await ctx.A.getSale(b.sale.id), null);
});

test('revocar sesiones de una empresa no toca las de la otra', async () => {
  for (const [company, user] of [['emp-a', 'ua'], ['emp-b', 'ub']]) {
    await ctx.db.query(`INSERT INTO users(id, company_id, username, role, password_salt, password_digest, password_iterations, password_algorithm)
      VALUES($1, $2, $1, 'admin', 's', 'd', 1, 'PBKDF2-SHA256')`, [user, company]);
    await ctx.repo.createSession({tokenHash: 'tok-' + user, userId: user, userVersion: 1, expiresAt: '2026-12-01T00:00:00Z'});
  }
  assert.equal(await ctx.repo.revokeSessions({companyId: 'emp-a'}), 1);
  assert.equal(await ctx.repo.getSession('tok-ua', NOW), null);
  assert.equal((await ctx.repo.getSession('tok-ub', NOW)).company_id, 'emp-b');
});
