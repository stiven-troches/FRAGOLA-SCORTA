// DM-03: migraciones versionadas probadas al aplicar, deshacer y volver a aplicar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestDatabase} from '../db/harness.mjs';
import {loadMigrations, migrateUp, migrateDown, migrationStatus, MIGRATIONS_DIR} from '../db/migrate.mjs';

const EXPECTED_TABLES = ['audit_log','cash_closures','companies','customers','idempotency_keys','login_throttle','mechanics','payments',
  'platform_meta','product_cost_history','products','purchase_lines','purchases','receipts','reversals','sale_drafts','sale_labor',
  'sale_lines','sales','security_events','service_lines','services','sessions','stock_movements','support_tickets','terms_acceptances',
  'ticket_messages','users'];

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
    assert.deepEqual(await migrateUp(db), ['001']);
    assert.deepEqual(await tables(db), EXPECTED_TABLES);
    assert.deepEqual(await migrateUp(db), [], 'idempotente: no reaplica');
    assert.deepEqual((await migrationStatus(db)).pending, []);

    assert.deepEqual(await migrateDown(db, {to: 0}), ['001']);
    assert.deepEqual(await tables(db), []);
    assert.deepEqual((await migrationStatus(db)).pending, ['001_inicial']);

    assert.deepEqual(await migrateUp(db), ['001']);
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
