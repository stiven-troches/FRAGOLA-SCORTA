// DM-03: migraciones versionadas probadas al aplicar, deshacer y volver a aplicar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestDatabase} from '../db/harness.mjs';
import {PAYMENT_KEYS, SALE_PAYMENT_KEYS} from '../sale-pricing.mjs';
import {loadMigrations, migrateUp, migrateDown, migrationStatus, MIGRATIONS_DIR} from '../db/migrate.mjs';

// 001 (modelo inicial) + 002 (modelo completo: medios de pago, pagos divididos, crédito, separados,
// cotizaciones, garantías, proveedores, órdenes de compra, caja).
const TABLES_001 = ['audit_log','cash_closures','companies','customers','idempotency_keys','login_throttle','mechanics','payments',
  'platform_meta','product_cost_history','products','purchase_lines','purchases','receipts','reversals','sale_drafts','sale_labor',
  'sale_lines','sales','security_events','service_lines','services','sessions','stock_movements','support_tickets','terms_acceptances',
  'ticket_messages','users'].sort();
const TABLES_002 = ['cash_movements','credit_payment_applications','credit_payments','layaway_lines','layaway_payments','layaways','payment_methods',
  'purchase_credit','purchase_order_history','purchase_order_lines','purchase_order_receipts','purchase_orders','quote_lines','quotes','reversal_refunds',
  'sale_credit','sale_payments','sale_vat_rates','supplier_payment_applications','supplier_payments','suppliers','warranties','warranty_history'];
const EXPECTED_TABLES = [...TABLES_001, ...TABLES_002].sort();

const tables = async db => (await db.query(`SELECT table_name FROM information_schema.tables
  WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY table_name`)).rows.map(r => r.table_name);

test('cada migración tiene su archivo .down.sql y numeración continua', () => {
  const migrations = loadMigrations();
  assert.ok(migrations.length >= 1);
  assert.equal(migrations[0].version, '001');
  for (const m of migrations) assert.match(m.down, /\S/);
});

test('aplicar desde cero, deshacer y volver a aplicar', async () => {
  const {db, close} = await createTestDatabase({migrate: false});
  try {
    assert.deepEqual(await migrateUp(db, {to: 1}), ['001']);
    assert.deepEqual(await tables(db), TABLES_001);
    assert.deepEqual(await migrateUp(db), ['002']);
    assert.deepEqual(await tables(db), EXPECTED_TABLES);
    assert.deepEqual(await migrateUp(db), [], 'idempotente: no reaplica');
    assert.deepEqual((await migrationStatus(db)).pending, []);

    assert.deepEqual(await migrateDown(db), ['002'], 'por omisión deshace solo la última');
    assert.deepEqual(await tables(db), TABLES_001, '002 deshecha deja exactamente el esquema de 001');
    assert.deepEqual(await migrateUp(db), ['002']);
    assert.deepEqual(await migrateDown(db, {to: 0}), ['002', '001']);
    assert.deepEqual(await tables(db), []);
    assert.deepEqual((await migrationStatus(db)).pending, ['001_inicial', '002_modelo_completo']);

    assert.deepEqual(await migrateUp(db), ['001', '002']);
    assert.deepEqual(await tables(db), EXPECTED_TABLES);
    // El esquema reaplicado funciona: CHECK de stock y día comercial de Bogotá.
    await db.query(`INSERT INTO companies(id,name,slug,start_date,end_date) VALUES('c1','Uno','uno','2026-11-01','2026-12-01')`);
    await assert.rejects(db.query(`INSERT INTO products(company_id,id,nombre,precio_venta,stock) VALUES('c1','p1','X',1,-1)`), /check/i);
    await db.query(`INSERT INTO stock_movements(company_id,id,fecha,producto_id,nombre,cantidad,tipo) VALUES('c1','m1','2026-11-20T03:00:00Z','p1','X',1,'ajuste')`);
    assert.equal((await db.query('SELECT fecha_comercial FROM stock_movements')).rows[0].fecha_comercial, '2026-11-19');
  } finally { await close(); }
});

test('deshacer se niega sobre una base con datos reales', async () => {
  const {db, close} = await createTestDatabase();
  try {
    await db.query(`INSERT INTO companies(id,name,slug,start_date,end_date) VALUES('c1','Uno','uno','2026-11-01','2026-12-01')`);
    await assert.rejects(migrateDown(db, {to: 0}), /datos de SCORTA/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM companies')).rows[0].n, 1, 'la transacción revirtió');
    assert.ok((await tables(db)).includes('products'));
    // 002 no tenía datos propios y se deshizo; 001 se negó (cada migración es su propia transacción).
    assert.deepEqual((await migrationStatus(db)).pending, ['002_modelo_completo']);
  } finally { await close(); }
});

test('002 se niega a deshacerse si hay datos del modelo completo y no toca nada', async () => {
  const {db, close} = await createTestDatabase();
  try {
    await db.query(`INSERT INTO companies(id,name,slug,start_date,end_date) VALUES('c1','Uno','uno','2026-11-01','2026-12-01')`);
    await db.query(`INSERT INTO cash_movements(company_id,id,tipo,fecha,method,amount) VALUES('c1','m1','gasto','2026-11-20','nequi',5000)`);
    await assert.rejects(migrateDown(db), /modelo completo/);
    assert.deepEqual((await migrationStatus(db)).pending, []);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cash_movements')).rows[0].n, 1);
    // Una columna nueva con datos también lo impide.
    await db.query('DELETE FROM cash_movements');
    await db.query(`UPDATE companies SET settings = '{"vat": {}}'::jsonb`);
    await assert.rejects(migrateDown(db), /modelo completo/);
  } finally { await close(); }
});

test('payment_methods repite los medios de pago reales de la app y la base rechaza otros', async () => {
  const {db, close} = await createTestDatabase();
  try {
    const {rows} = await db.query('SELECT code, moves_money FROM payment_methods ORDER BY sort_order');
    assert.deepEqual(rows.map(r => r.code), SALE_PAYMENT_KEYS, 'misma lista y orden que sale-pricing.mjs');
    assert.deepEqual(rows.filter(r => r.moves_money).map(r => r.code), PAYMENT_KEYS);
    await db.query(`INSERT INTO companies(id,name,slug,start_date,end_date) VALUES('c1','Uno','uno','2026-11-01','2026-12-01')`);
    await db.query(`INSERT INTO cash_movements(company_id,id,tipo,fecha,method,amount) VALUES('c1','m1','gasto','2026-11-20','daviplata',5000)`);
    await assert.rejects(db.query(`INSERT INTO cash_movements(company_id,id,tipo,fecha,method,amount) VALUES('c1','m2','gasto','2026-11-20','cheque',5000)`), /foreign key|llave foránea|check/i);
    // El crédito no mueve dinero: no puede ser el medio de un movimiento de caja.
    await assert.rejects(db.query(`INSERT INTO cash_movements(company_id,id,tipo,fecha,method,amount) VALUES('c1','m3','gasto','2026-11-20','credito',5000)`), /check/i);
  } finally { await close(); }
});

test('una migración fallida no deja cambios a medias y una editada se detecta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scorta-mig-'));
  const {db, close} = await createTestDatabase({migrate: false});
  try {
    writeFileSync(join(dir, '001_base.sql'), 'CREATE TABLE t1(id int);');
    writeFileSync(join(dir, '001_base.down.sql'), 'DROP TABLE t1;');
    writeFileSync(join(dir, '002_rota.sql'), 'CREATE TABLE t2(id int); SELECT * FROM tabla_inexistente;');
    writeFileSync(join(dir, '002_rota.down.sql'), 'DROP TABLE t2;');
    await assert.rejects(migrateUp(db, {dir}), /tabla_inexistente/);
    assert.deepEqual((await migrationStatus(db, {dir})).applied.map(r => r.version), ['001']);
    assert.equal((await db.query(`SELECT to_regclass('t2') AS t`)).rows[0].t, null, '002 revertida completa');
    writeFileSync(join(dir, '001_base.sql'), 'CREATE TABLE t1(id bigint);');
    rmSync(join(dir, '002_rota.sql')); rmSync(join(dir, '002_rota.down.sql'));
    await assert.rejects(migrateUp(db, {dir}), /cambió después de aplicarse/);
    writeFileSync(join(dir, '003_sin_down.sql'), 'SELECT 1;');
    assert.throws(() => loadMigrations(dir), /Falta 003_sin_down\.down\.sql/);
  } finally { await close(); rmSync(dir, {recursive: true, force: true}); }
});

test('las migraciones viven en db/migrations', () => {
  assert.match(MIGRATIONS_DIR.replaceAll('\\', '/'), /db\/migrations$/);
});
