// BE-09 / DM-12: la purga de una empresa en Postgres borra TODO por company_id (audit_log, security_events,
// sessions, idempotency_keys, receipts, sale_drafts y las tablas nuevas) y devuelve conteos por tabla para el
// certificado. `DELETE FROM companies` solo dejaría el rastro con nombres, teléfonos y placas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '../db/harness.mjs';
import {importPlatform, TABLE_COLUMNS} from '../db/import-json.mjs';
import {exportPlatform} from '../db/export-json.mjs';
import {checksumsFromDatabase} from '../db/verify.mjs';
import {PostgresRepository} from '../db/repository.mjs';
import {buildRichSampleState} from '../db/sample-state.mjs';
import {diffStates} from '../db/compare-state.mjs';

const rich = buildRichSampleState();
const NOW = '2026-11-25T15:00:00.000Z';
// Datos personales de «Taller Rico» (empresa A) y de «Taller Norte» (empresa B, intacta).
const A = {name: 'Taller Rico', needles: ['Taller Rico', 'taller-rico', '3105550101', '3105550202', '3105550303', '3105550404', '3105550505', 'Carlos Crédito', 'Laura Favor', 'Pedro Dividido',
  'Marta Separa', 'Prospecto Sin Compra', 'Luis Taller', 'RIC12A', 'carlos@example.invalid', 'Lubricantes del Valle', '1020304050', 'Marta Ríos']};
const B = {name: 'Taller Norte', needles: ['Taller Norte', 'taller-norte', 'Ana Pérez', 'Ana María Pérez', '3001234567', 'Luis Gómez', 'ABC12D']};

async function seed(db, shopId, label, owner, adminId, sellerId) {
  const tag = label.needles[0];
  await db.query(`INSERT INTO security_events(id, fecha, tipo, company_id, details) VALUES($1, $2, 'login_fallido', $3, $4)`,
    ['ev-' + shopId, NOW, shopId, JSON.stringify({usuario: label.needles[2], empresa: tag, telefono: label.needles[2]})]);
  await db.query(`INSERT INTO audit_log(scope, company_id, id, fecha, accion, despues) VALUES('platform', $1, $2, $3, 'company.update', $4)`,
    [shopId, 'pa-' + shopId, NOW, JSON.stringify({name: tag, contact: 'Contacto ' + label.needles[2]})]);
  await db.query(`INSERT INTO sessions(token_hash, user_id, user_version, expires_at, support_company_id, support_reason) VALUES($1, $2, 1, '2026-12-30T00:00:00Z', $3, $4)`,
    ['sup-' + shopId, owner, shopId, 'Revisar la venta de ' + label.needles[2]]);
  await db.query(`UPDATE idempotency_keys SET result = $2 WHERE company_id = $1 AND ctid = (SELECT ctid FROM idempotency_keys WHERE company_id = $1 LIMIT 1)`,
    [shopId, JSON.stringify({saleId: 'x', cliente: label.needles[2]})]);
  await db.query(`INSERT INTO login_throttle(kind, key, count, until) VALUES('password', $1, 2, '2026-12-01T00:00:00Z') ON CONFLICT DO NOTHING`, [adminId]);
  await db.query(`INSERT INTO sale_drafts(company_id, user_id, support, version, draft) VALUES($1, $2, true, 1, $3) ON CONFLICT (company_id, user_id, support) DO UPDATE SET draft = $3`,
    [shopId, sellerId, JSON.stringify({saleForm: {cliente: label.needles[2], telefono: label.needles[2]}})]);
  await db.query(`UPDATE receipts SET extra = $2 WHERE company_id = $1`, [shopId, JSON.stringify({cliente: label.needles[2]})]);
  await db.query(`UPDATE support_tickets SET description = $2 WHERE company_id = $1`, [shopId, 'Llamar a ' + label.needles[2]]);
  await db.query(`INSERT INTO ticket_messages(company_id, ticket_id, seq, id, message, created_at)
    SELECT company_id, id, 50, 'msg-' || company_id, $2, now() FROM support_tickets WHERE company_id = $1 LIMIT 1`, [shopId, 'El cliente ' + label.needles[2] + ' pidió factura']);
}

/** Tablas (de todo el esquema) con filas cuyo texto contiene alguno de los textos buscados. */
async function scan(db, needles) {
  const {rows: tables} = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY 1`);
  const found = {};
  for (const {table_name: table} of tables) for (const needle of needles) {
    const n = (await db.query(`SELECT count(*)::int AS n FROM ${table} t WHERE t::text ILIKE $1`, ['%' + needle + '%'])).rows[0].n;
    if (n) (found[table] ??= new Set()).add(needle);
  }
  return Object.fromEntries(Object.entries(found).map(([table, set]) => [table, [...set].sort()]));
}
async function companyRows(db, companyId) {
  const {rows: tables} = await db.query(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'company_id'
    AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE')`);
  const left = {};
  for (const {table_name: table} of tables) {
    const n = (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE company_id = $1`, [companyId])).rows[0].n;
    if (n) left[table] = n;
  }
  return left;
}
async function setup() {
  const {state, shops, rich: {shop}} = await rich;
  const database = await createTestDatabase(), {db} = database;
  await importPlatform(db, state);
  const owner = state.users.find(u => u.role === 'owner'), norte = shops[0].company.id;
  const users = company => state.users.filter(u => u.companyId === company);
  await seed(db, shop.company.id, A, owner.id, users(shop.company.id).find(u => u.role === 'admin').id, users(shop.company.id).find(u => u.username === 'vendedor').id);
  await seed(db, norte, B, owner.id, users(norte).find(u => u.role === 'admin').id, users(norte).find(u => u.username === 'vendedor').id);
  return {...database, state, a: shop.company.id, b: norte, repo: new PostgresRepository(db)};
}

test('el importador guarda idempotency_keys.company_id (antes quedaba NULL)', async () => {
  const {db, close, state, a, b} = await setup();
  try {
    const mine = id => new Set(state.users.filter(u => u.companyId === id).map(u => u.id));
    for (const company of [a, b]) {
      const expected = Object.keys(state.requests).filter(key => mine(company).has(key.split('|')[0])).length;
      assert.ok(expected > 0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM idempotency_keys WHERE company_id = $1', [company])).rows[0].n, expected);
    }
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM idempotency_keys WHERE company_id IS NULL AND user_id = ANY($1::text[])`, [[...mine(a)]])).rows[0].n, 0);
  } finally { await close(); }
});

test('DELETE FROM companies solo NO alcanza: deja auditoría, eventos, sesiones y borradores con datos personales', async () => {
  const {db, close, a} = await setup();
  try {
    await db.query('DELETE FROM companies WHERE id = $1', [a]);
    const left = await scan(db, A.needles);
    assert.ok(left.audit_log && left.security_events && left.sessions, 'el rastro sobrevive al borrado en cascada: ' + JSON.stringify(Object.keys(left)));
    // Lo que sí tiene FK se fue (cascada), incluida la idempotencia por empresa.
    assert.equal((await db.query('SELECT count(*)::int AS n FROM idempotency_keys WHERE company_id = $1', [a])).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM sales WHERE company_id = $1', [a])).rows[0].n, 0);
  } finally { await close(); }
});

test('purgeCompany: no queda ninguna fila ni texto personal de la empresa y la otra queda intacta', async () => {
  const {db, close, repo, state, a, b} = await setup();
  try {
    const before = await scan(db, [...A.needles, ...B.needles]);
    for (const table of ['audit_log', 'security_events', 'sessions', 'idempotency_keys', 'receipts', 'sale_drafts', 'support_tickets', 'ticket_messages', 'customers', 'sales', 'quotes', 'layaways',
      'credit_payments', 'warranties', 'cash_movements', 'suppliers', 'purchase_orders', 'supplier_payments', 'cash_closures', 'users', 'companies'])
      assert.ok(before[table], `antes de purgar, ${table} tenía datos personales de la empresa A`);
    const exportBefore = await exportPlatform(db), sumsBefore = await checksumsFromDatabase(db);
    const rowsB = await companyRows(db, b);
    const countSessions = async (users, company) => (await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = ANY($1::text[]) OR support_company_id = $2', [users, company])).rows[0].n;
    const sessionsAll = (await db.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n, sessionsB = await countSessions(state.users.filter(u => u.companyId === b).map(u => u.id), b),
      sessionsA = await countSessions(state.users.filter(u => u.companyId === a).map(u => u.id), a);
    assert.ok(sessionsA >= 2 && sessionsB >= 2);

    const result = await repo.purgeCompany(a, {actor: {id: 'owner-1', username: 'owner'}, now: NOW});
    assert.equal(result.companyId, a);
    assert.equal(result.empresa, 'Taller Rico');
    assert.equal(result.certificate, null);
    // Conteos por tabla para el certificado.
    for (const table of ['companies', 'users', 'sales', 'sale_lines', 'sale_payments', 'sale_credit', 'cash_movements', 'credit_payments', 'layaways', 'quotes', 'warranties', 'suppliers', 'purchase_orders',
      'supplier_payments', 'receipts', 'sale_drafts', 'audit_log', 'security_events', 'idempotency_keys', 'sessions', 'support_tickets', 'ticket_messages', 'customers', 'products', 'cash_closures'])
      assert.ok(result.tables[table] >= 1, `conteo de ${table}`);
    assert.equal(result.tables.companies, 1);
    assert.equal(result.tables.security_events, 1);
    assert.equal(result.tables.sale_drafts, 1);
    assert.equal(result.tables.cash_movements, 5);
    assert.equal(result.tables.quotes, 2);
    assert.equal(result.total, Object.values(result.tables).reduce((n, v) => n + v, 0));
    assert.ok(Object.keys(result.tables).every(table => Object.hasOwn(TABLE_COLUMNS, table)));

    // 1) Ninguna tabla conserva una fila de A, ni un usuario, sesión o llave de idempotencia suyos.
    assert.deepEqual(await companyRows(db, a), {});
    assert.equal((await db.query('SELECT count(*)::int AS n FROM companies WHERE id = $1', [a])).rows[0].n, 0);
    const userIds = state.users.filter(u => u.companyId === a).map(u => u.id);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = ANY($1::text[]) OR support_company_id = $2', [userIds, a])).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM idempotency_keys WHERE user_id = ANY($1::text[])', [userIds])).rows[0].n, 0);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM login_throttle WHERE kind = 'password' AND key = ANY($1::text[])`, [userIds])).rows[0].n, 0);
    // 2) Ningún texto de A (nombre de la empresa, teléfonos, clientes, placa, correo, proveedor) en NINGUNA tabla.
    assert.deepEqual(await scan(db, A.needles), {});
    // 3) B intacta: sus filas, sus textos y sus sumas de control no cambiaron.
    assert.deepEqual(await companyRows(db, b), rowsB);
    const after = await scan(db, B.needles);
    for (const [table, needles] of Object.entries(before)) if (needles.some(n => B.needles.includes(n))) assert.ok(after[table], `B conserva sus datos en ${table}`);
    const sumsAfter = await checksumsFromDatabase(db);
    // Sumas de control de las demás empresas (las globales de la plataforma sí cambian: sesiones, eventos, auditoría...).
    for (const [key, value] of sumsBefore) if (!key.startsWith(a + '|') && !key.startsWith('(plataforma)|')) assert.deepEqual(sumsAfter.get(key), value, key);
    const bUsers = state.users.filter(u => u.companyId === b).map(u => u.id);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = ANY($1::text[]) OR support_company_id = $2', [bUsers, b])).rows[0].n, sessionsB, 'las sesiones de B siguen');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n, sessionsAll - sessionsA);
    const exportAfter = await exportPlatform(db);
    assert.deepEqual(exportAfter.businesses[b], exportBefore.businesses[b]);
    assert.deepEqual(exportAfter.companies.filter(c => c.id === b), exportBefore.companies.filter(c => c.id === b));
    assert.equal(exportAfter.companies.length, exportBefore.companies.length - 1);
    assert.equal(exportAfter.users.length, exportBefore.users.length - userIds.length);
    assert.deepEqual(Object.keys(exportAfter.businesses).sort(), Object.keys(exportBefore.businesses).filter(id => id !== a).sort());
    // 4) Es idempotente: una empresa que ya no existe se informa.
    await assert.rejects(repo.purgeCompany(a, {now: NOW}), error => error.code === 'COMPANY_NOT_FOUND');
    await assert.rejects(repo.purgeCompany('', {now: NOW}), error => error.code === 'COMPANY_REQUIRED');
  } finally { await close(); }
});

test('purgeCompany con certificado: solo queda el certificado (nombre, id, fechas y conteos), sin datos de clientes', async () => {
  const {db, close, repo, a} = await setup();
  try {
    const {certificate, tables} = await repo.purgeCompany(a, {actor: {id: 'o1', username: 'owner'}, now: NOW, certificate: true});
    assert.deepEqual(Object.keys(certificate).sort(), ['borradoEn', 'borradoPor', 'companyId', 'conteos', 'empresa', 'exportadoEn']);
    assert.equal(certificate.borradoPor, 'owner');
    assert.equal(certificate.borradoEn, NOW);
    assert.deepEqual(certificate.conteos, tables);
    const stored = (await db.query(`SELECT scope, company_id, accion, extra FROM audit_log WHERE accion = 'company.purge'`)).rows;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].scope, 'platform');
    assert.equal(stored[0].company_id, null, 'el certificado no se amarra a la empresa borrada');
    assert.equal(stored[0].extra.certificado.empresa, 'Taller Rico');
    // El nombre de la empresa solo aparece en el certificado; ningún dato de clientes.
    assert.deepEqual(await scan(db, A.needles.filter(n => n !== 'Taller Rico')), {});
    assert.deepEqual(await scan(db, ['Taller Rico']), {audit_log: ['Taller Rico']});
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM audit_log WHERE company_id = $1`, [a])).rows[0].n, 0);
  } finally { await close(); }
});

test('purgeCompany es todo o nada y se niega si una tabla con company_id no está cubierta', async () => {
  const {db, close, repo, a, b} = await setup();
  try {
    await db.exec('CREATE TABLE zz_futura (company_id text, dato text)');
    await db.query(`INSERT INTO zz_futura VALUES($1, 'Carlos Crédito')`, [a]);
    const sales = (await db.query('SELECT count(*)::int AS n FROM sales WHERE company_id = $1', [a])).rows[0].n;
    await assert.rejects(repo.purgeCompany(a, {now: NOW}), error => error.code === 'PURGE_INCOMPLETE' && /zz_futura/.test(error.message));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM sales WHERE company_id = $1', [a])).rows[0].n, sales, 'no borró nada');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM companies WHERE id = $1', [a])).rows[0].n, 1);
    await db.exec('DROP TABLE zz_futura');
    // Un fallo a mitad de la purga revierte todo: una restricción que impide borrar `products` de A.
    await db.exec(`CREATE FUNCTION zz_bloquea() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'bloqueado'; END $$`);
    await db.exec('CREATE TRIGGER zz_bloquea BEFORE DELETE ON products FOR EACH ROW EXECUTE FUNCTION zz_bloquea()');
    await assert.rejects(repo.purgeCompany(a, {now: NOW}), /bloqueado/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM sales WHERE company_id = $1', [a])).rows[0].n, sales, 'la transacción revirtió lo que ya había borrado');
    assert.ok((await db.query('SELECT count(*)::int AS n FROM audit_log WHERE company_id = $1', [a])).rows[0].n > 0);
    assert.ok((await db.query('SELECT count(*)::int AS n FROM companies WHERE id = $1', [b])).rows[0].n === 1);
  } finally { await close(); }
});
