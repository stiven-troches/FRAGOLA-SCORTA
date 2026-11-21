// DM-04 / QA-16: importa un estado real (construido con platformRequest) y verifica
// cero diferencias por empresa, por tabla y por fecha.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createTestDatabase} from '../db/harness.mjs';
import {importPlatform, mapPlatformState, readPlatformFile, TABLE_COLUMNS} from '../db/import-json.mjs';
import {checksumsFromState, compareChecksums, verifyImport} from '../db/verify.mjs';
import {buildSampleState} from '../db/sample-state.mjs';

const sample = buildSampleState();

test('importa varias empresas y la verificación da cero diferencias', async () => {
  const {state, shops} = await sample;
  const {db, close} = await createTestDatabase();
  try {
    const counts = await importPlatform(db, state);
    assert.equal(counts.companies, 3);
    assert.ok(counts.sales >= 15 && counts.sale_labor === 3 && counts.reversals >= 9 && counts.cash_closures === 3);
    assert.ok(counts.ticket_messages >= 4 && counts.sale_drafts === 3 && counts.payments === 1 && counts.terms_acceptances === 3);
    const result = await verifyImport(db, state);
    assert.deepEqual(result.differences, []);
    assert.ok(result.ok);
    for (const table of ['sales', 'purchases', 'services', 'stock_movements', 'cash_closures', 'products.stock', 'payments', 'support_tickets', 'audit_log.business'])
      assert.ok(result.tables.includes(table), table);

    // Campos nuevos en su columna.
    const sale = (await db.query(`SELECT * FROM sales WHERE company_id = $1 AND id = $2`, [shops[0].company.id, shops[0].sales[1]])).rows[0];
    assert.equal(sale.payment_method, 'transferencia');
    assert.ok(sale.receipt_hash && sale.receipt_expires_at && sale.data_consent_at);
    const late = (await db.query(`SELECT * FROM reversals WHERE company_id = $1 AND after_closure`, [shops[0].company.id])).rows;
    assert.equal(late.length, 1);
    assert.equal(late[0].fecha_comercial, '2026-11-20');
    const closure = (await db.query('SELECT * FROM cash_closures WHERE company_id = $1', [shops[0].company.id])).rows[0];
    assert.equal(closure.date, '2026-11-19');
    assert.ok(closure.summary && typeof closure.expected === 'object' && 'efectivo' in closure.expected);
    const labor = (await db.query('SELECT * FROM sale_labor WHERE company_id = $1', [shops[0].company.id])).rows[0];
    assert.equal(labor.mecanico_porcentaje, '50.00');
    assert.equal((await db.query(`SELECT percentage FROM mechanics WHERE company_id = $1 AND name = 'Segundo mecánico'`, [shops[0].company.id])).rows[0].percentage, '35.50');
    const history = (await db.query(`SELECT kind, cantidad, stock_antes FROM product_cost_history WHERE company_id = $1 AND product_id = $2 ORDER BY seq`, [shops[0].company.id, shops[0].filtro.id])).rows;
    assert.deepEqual(history.map(h => h.kind), ['baseline', 'purchase']);
    assert.equal(history[1].cantidad, 4);
    const owner = (await db.query(`SELECT * FROM users WHERE role = 'owner'`)).rows[0];
    assert.equal(owner.company_id, null);
    assert.equal(owner.totp_enabled, false);
    const legacy = (await db.query(`SELECT extra FROM services WHERE id = 'legacy-1'`)).rows[0];
    assert.equal(legacy.extra.campoAntiguo, 'se conserva en extra');
    const meta = (await db.query('SELECT extra, owner_origins FROM platform_meta')).rows[0];
    assert.equal(meta.extra.receiptSecretsDropped, true);
    assert.equal(meta.owner_origins.length, 1);
  } finally { await close(); }
});

test('una diferencia real se detecta por empresa, tabla y fecha', async () => {
  const {state, shops} = await sample;
  const {db, close} = await createTestDatabase();
  try {
    await importPlatform(db, state);
    await db.query(`UPDATE sales SET total = total + 1 WHERE company_id = $1 AND id = $2`, [shops[1].company.id, shops[1].sales[0]]);
    await db.query(`UPDATE products SET stock = stock + 1 WHERE company_id = $1 AND id = $2`, [shops[2].company.id, shops[2].bujia.id]);
    await db.query(`DELETE FROM cash_closures WHERE company_id = $1`, [shops[0].company.id]);
    const {differences} = await verifyImport(db, state);
    const find = (company, table, field) => differences.find(d => d.company === company && d.table === table && d.field === field);
    assert.equal(find(shops[1].company.id, 'sales', 'total').dimension, '2026-11-19');
    assert.equal(BigInt(find(shops[1].company.id, 'sales', 'total').actual) - BigInt(find(shops[1].company.id, 'sales', 'total').expected), 100n);
    assert.equal(find(shops[2].company.id, 'products.stock', 'stock').dimension, shops[2].bujia.id);
    assert.equal(find(shops[0].company.id, 'cash_closures', 'expected').dimension, '2026-11-19');
  } finally { await close(); }
});

test('la importación es todo o nada y no escribe sobre una base con datos', async () => {
  const {state} = await sample;
  const {db, close} = await createTestDatabase();
  try {
    const broken = structuredClone(state);
    Object.values(broken.businesses)[1].ventas[0].total = -5; // viola CHECK (total >= 0)
    await assert.rejects(importPlatform(db, broken), /check/i);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM companies')).rows[0].n, 0, 'nada quedó a medias');
    await importPlatform(db, state);
    await assert.rejects(importPlatform(db, state), /ya tiene datos/);
  } finally { await close(); }
});

test('cada campo del JSON tiene columna o va a extra (nada se pierde)', async () => {
  const {state} = await sample;
  const tables = mapPlatformState(state);
  for (const [table, rows] of Object.entries(tables)) for (const row of rows)
    for (const key of Object.keys(row)) assert.ok(TABLE_COLUMNS[table].includes(key), `${table}.${key} sin columna`);
  // Campos desconocidos en cualquier nivel terminan en extra.
  const extended = structuredClone(state), business = Object.values(extended.businesses)[0];
  extended.nuevoCampoRaiz = {a: 1};
  business.prods[0].color = 'rojo';
  business.ventas[0].detalles[0].lote = 'L-1';
  business.campoNegocio = [1, 2];
  extended.users[0].password.pepper = 'v2';
  const mapped = mapPlatformState(extended);
  assert.equal(JSON.parse(mapped.platform_meta[0].extra).nuevoCampoRaiz.a, 1);
  assert.equal(JSON.parse(mapped.products.find(p => p.id === business.prods[0].id).extra).color, 'rojo');
  assert.equal(JSON.parse(mapped.sale_lines.find(l => l.sale_id === business.ventas[0].id && l.line_no === 0).extra).lote, 'L-1');
  assert.deepEqual(JSON.parse(mapped.companies.find(c => c.business_extra).business_extra).campoNegocio, [1, 2]);
  assert.equal(JSON.parse(mapped.users[0].extra).password.pepper, 'v2');
});

test('lee platform.sqlite (tabla platform, fila 1) y JSON', async () => {
  const {state} = await sample;
  const dir = mkdtempSync(join(tmpdir(), 'scorta-import-'));
  try {
    const file = join(dir, 'platform.sqlite'), sqlite = new DatabaseSync(file);
    sqlite.exec('CREATE TABLE platform(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, storage_version INTEGER NOT NULL DEFAULT 0)');
    sqlite.prepare('INSERT INTO platform(id, data) VALUES(1, ?)').run(JSON.stringify(state));
    sqlite.close();
    const fromSqlite = await readPlatformFile(file);
    writeFileSync(join(dir, 'estado.json'), JSON.stringify(state));
    const fromJson = await readPlatformFile(join(dir, 'estado.json'));
    assert.deepEqual(compareChecksums(checksumsFromState(state), checksumsFromState(fromSqlite)), []);
    assert.deepEqual(fromJson, fromSqlite);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
