// DM-04 / QA-16: control sums of an import, by company, by table and by date.
// Computes the same metrics twice, independently:
//   - from the original JSON state (plain JavaScript over the arrays), and
//   - from Postgres (SQL aggregates over the normalized tables),
// and lists every difference. Zero differences is the approval criterion of the migration.
// Money is compared in integer cents (BigInt); counts and quantities as integers.
// CLI: node db/verify.mjs <platform.sqlite|estado.json>   (SCORTA_DATABASE_URL)
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDatabase} from './client.mjs';
import {businessDay, readPlatformFile} from './import-json.mjs';

const BOGOTA = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'});
/** Money -> cents. Accepts numbers (JSON) and exact numeric strings (Postgres). */
export function cents(value) {
  if (value == null || value === '') return 0n;
  if (typeof value === 'number') return BigInt(Math.round(value * 100));
  const [whole, fraction = ''] = String(value).split('.'), negative = whole.startsWith('-');
  const result = BigInt(whole.replace('-', '') || '0') * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -result : result;
}
const int = value => BigInt(value ?? 0);
const PLATFORM = '(plataforma)';

class Sums {
  constructor() { this.map = new Map(); }
  add(company, table, dimension, fields) {
    const key = `${company}|${table}|${dimension}`, current = this.map.get(key) || {};
    for (const [field, value] of Object.entries(fields)) current[field] = (current[field] ?? 0n) + BigInt(value);
    this.map.set(key, current);
  }
}

/** Control sums straight from the JSON platform state. */
export function checksumsFromState(input) {
  const state = JSON.parse(JSON.stringify(input)), s = new Sums();
  for (const u of state.users || []) s.add(u.companyId ?? PLATFORM, 'users', '*', {count: 1});
  s.add(PLATFORM, 'sessions', '*', {count: Object.keys(state.sessions || {}).length});
  s.add(PLATFORM, 'login_throttle', '*', {count: ['loginFailures', 'loginOrigins', 'accountFailures', 'passwordFailures'].reduce((n, f) => n + Object.keys(state[f] || {}).length, 0)});
  s.add(PLATFORM, 'idempotency_keys', '*', {count: Object.keys(state.requests || {}).length});
  s.add(PLATFORM, 'security_events', '*', {count: (state.securityEvents || []).length});
  s.add(PLATFORM, 'audit_log.platform', '*', {count: (state.audit || []).length});
  for (const p of state.payments || []) s.add(p.companyId, 'payments', p.date, {count: 1, amount: cents(p.amount)});
  for (const r of Object.values(state.receipts || {})) s.add(r.companyId, 'receipts', '*', {count: 1});
  for (const t of state.supportTickets || []) s.add(t.companyId, 'support_tickets', '*', {count: 1, messages: (t.messages || []).length});
  for (const key of Object.keys(state.saleDrafts || {})) s.add(JSON.parse(key)[0], 'sale_drafts', '*', {count: 1});
  for (const c of state.companies || []) {
    const b = state.businesses?.[c.id] || {};
    s.add(c.id, 'companies', '*', {count: 1, revision: b.revision ?? 0, terms: c.terms ? 1 : 0});
    for (const p of b.prods || []) {
      s.add(c.id, 'products', '*', {count: 1, stock: int(p.stock), cost_history: (p.costHistory || []).length, sale_price: cents(p.precio_venta)});
      s.add(c.id, 'products.stock', p.id, {stock: int(p.stock)});
    }
    const lines = (lines = []) => lines.reduce((acc, l) => ({lines: acc.lines + 1n, qty: acc.qty + int(l.cantidad), returned: acc.returned + int(l.devuelto),
      amount: acc.amount + int(l.cantidad) * cents(l.precio_unitario)}), {lines: 0n, qty: 0n, returned: 0n, amount: 0n});
    for (const sale of b.ventas || []) {
      const labor = sale.labor || [];
      s.add(c.id, 'sales', businessDay(sale.fecha), {count: 1, total: cents(sale.total), cancelled: sale.anulada ? 1 : 0, ...lines(sale.detalles),
        labor_lines: labor.length, labor: labor.reduce((n, l) => n + cents(l.importe), 0n), reversals: (sale.reversiones || []).length});
    }
    for (const doc of b.compras || []) s.add(c.id, 'purchases', businessDay(doc.fecha), {count: 1, total: cents(doc.total), cancelled: doc.anulada ? 1 : 0, ...lines(doc.detalles), reversals: (doc.reversiones || []).length});
    for (const sv of b.servs || []) s.add(c.id, 'services', businessDay(sv.fecha), {count: 1, total: cents(sv.total), cancelled: sv.anulada ? 1 : 0, ...lines(sv.detalles), reversals: (sv.reversiones || []).length});
    for (const m of b.movimientos || []) s.add(c.id, 'stock_movements', BOGOTA.format(new Date(m.fecha)), {count: 1, qty: int(m.cantidad)});
    for (const cl of b.cashClosures || []) s.add(c.id, 'cash_closures', cl.date, {count: 1, expected: cents(cl.totals?.expected), actual: cents(cl.totals?.actual), difference: cents(cl.totals?.difference)});
    s.add(c.id, 'customers', '*', {count: (b.customerRecords || []).length});
    s.add(c.id, 'mechanics', '*', {count: (b.mechanics || []).length});
    s.add(c.id, 'audit_log.business', '*', {count: (b.auditoria || []).length});
  }
  return s.map;
}

/** Control sums from the normalized Postgres tables. */
export async function checksumsFromDatabase(db) {
  const s = new Sums(), q = async sql => (await db.query(sql)).rows;
  for (const r of await q(`SELECT coalesce(company_id, '${PLATFORM}') AS c, count(*) AS n FROM users GROUP BY 1`)) s.add(r.c, 'users', '*', {count: r.n});
  s.add(PLATFORM, 'sessions', '*', {count: (await q('SELECT count(*) AS n FROM sessions'))[0].n});
  s.add(PLATFORM, 'login_throttle', '*', {count: (await q('SELECT count(*) AS n FROM login_throttle'))[0].n});
  s.add(PLATFORM, 'idempotency_keys', '*', {count: (await q('SELECT count(*) AS n FROM idempotency_keys'))[0].n});
  s.add(PLATFORM, 'security_events', '*', {count: (await q('SELECT count(*) AS n FROM security_events'))[0].n});
  s.add(PLATFORM, 'audit_log.platform', '*', {count: (await q(`SELECT count(*) AS n FROM audit_log WHERE scope = 'platform'`))[0].n});
  for (const r of await q('SELECT company_id, date::text AS d, count(*) AS n, sum(amount)::text AS amount FROM payments GROUP BY 1, 2')) s.add(r.company_id, 'payments', r.d, {count: r.n, amount: cents(r.amount)});
  for (const r of await q('SELECT company_id, count(*) AS n FROM receipts GROUP BY 1')) s.add(r.company_id, 'receipts', '*', {count: r.n});
  for (const r of await q(`SELECT t.company_id, count(*) AS n, coalesce(sum((SELECT count(*) FROM ticket_messages m WHERE m.company_id = t.company_id AND m.ticket_id = t.id)), 0) AS m
    FROM support_tickets t GROUP BY 1`)) s.add(r.company_id, 'support_tickets', '*', {count: r.n, messages: r.m});
  for (const r of await q('SELECT company_id, count(*) AS n FROM sale_drafts GROUP BY 1')) s.add(r.company_id, 'sale_drafts', '*', {count: r.n});
  for (const r of await q(`SELECT c.id, c.business_revision AS rev, (SELECT count(*) FROM terms_acceptances t WHERE t.company_id = c.id) AS terms FROM companies c`))
    s.add(r.id, 'companies', '*', {count: 1, revision: r.rev, terms: r.terms});
  for (const r of await q(`SELECT company_id, count(*) AS n, coalesce(sum(stock), 0) AS stock, sum(precio_venta)::text AS price,
    (SELECT count(*) FROM product_cost_history h WHERE h.company_id = p.company_id) AS h FROM products p GROUP BY company_id`))
    s.add(r.company_id, 'products', '*', {count: r.n, stock: r.stock, cost_history: r.h, sale_price: cents(r.price)});
  for (const r of await q('SELECT company_id, id, stock FROM products')) s.add(r.company_id, 'products.stock', r.id, {stock: r.stock});

  const documentSums = async (table, linesTable, parentKey, docType, extraSelect = '') => {
    const rows = await q(`SELECT d.company_id, d.fecha::text AS d, count(*) AS n, sum(d.total)::text AS total, count(*) FILTER (WHERE d.anulada) AS cancelled,
        coalesce(sum(l.lines), 0) AS lines, coalesce(sum(l.qty), 0) AS qty, coalesce(sum(l.returned), 0) AS returned, coalesce(sum(l.amount), 0)::text AS amount,
        coalesce(sum(r.n), 0) AS reversals ${extraSelect}
      FROM ${table} d
      LEFT JOIN LATERAL (SELECT count(*) AS lines, sum(cantidad) AS qty, sum(devuelto) AS returned, sum(cantidad * precio_unitario) AS amount
        FROM ${linesTable} x WHERE x.company_id = d.company_id AND x.${parentKey} = d.id) l ON true
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM reversals v WHERE v.company_id = d.company_id AND v.doc_type = '${docType}' AND v.doc_id = d.id) r ON true
      ${table === 'sales' ? `LEFT JOIN LATERAL (SELECT count(*) AS lines, sum(importe) AS amount FROM sale_labor sl WHERE sl.company_id = d.company_id AND sl.sale_id = d.id) lb ON true` : ''}
      GROUP BY 1, 2`);
    for (const r of rows) {
      const fields = {count: r.n, total: cents(r.total), cancelled: r.cancelled, lines: r.lines, qty: r.qty, returned: r.returned, amount: cents(r.amount), reversals: r.reversals};
      if (table === 'sales') Object.assign(fields, {labor_lines: r.labor_lines, labor: cents(r.labor)});
      s.add(r.company_id, table, r.d, fields);
    }
  };
  await documentSums('sales', 'sale_lines', 'sale_id', 'venta', ', coalesce(sum(lb.lines), 0) AS labor_lines, coalesce(sum(lb.amount), 0)::text AS labor');
  await documentSums('purchases', 'purchase_lines', 'purchase_id', 'compra');
  await documentSums('services', 'service_lines', 'service_id', 'servicio');
  for (const r of await q('SELECT company_id, fecha_comercial::text AS d, count(*) AS n, sum(cantidad) AS qty FROM stock_movements GROUP BY 1, 2'))
    s.add(r.company_id, 'stock_movements', r.d, {count: r.n, qty: r.qty});
  for (const r of await q('SELECT company_id, date::text AS d, count(*) AS n, sum(expected_total)::text AS e, sum(actual_total)::text AS a, sum(difference_total)::text AS f FROM cash_closures GROUP BY 1, 2'))
    s.add(r.company_id, 'cash_closures', r.d, {count: r.n, expected: cents(r.e), actual: cents(r.a), difference: cents(r.f)});
  const perCompany = async (table, sql) => {
    const found = new Map((await q(sql)).map(r => [r.company_id, r.n]));
    for (const {id} of await q('SELECT id FROM companies')) s.add(id, table, '*', {count: found.get(id) ?? 0});
  };
  await perCompany('customers', 'SELECT company_id, count(*) AS n FROM customers GROUP BY 1');
  await perCompany('mechanics', 'SELECT company_id, count(*) AS n FROM mechanics GROUP BY 1');
  await perCompany('audit_log.business', `SELECT company_id, count(*) AS n FROM audit_log WHERE scope = 'business' GROUP BY 1`);
  return s.map;
}

/** Compares two checksum maps. A missing key on one side counts as zeros. */
export function compareChecksums(expected, actual) {
  const differences = [];
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const a = expected.get(key) || {}, b = actual.get(key) || {};
    for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[field] ?? 0n, y = b[field] ?? 0n;
      if (x !== y) {
        const [company, table, dimension] = key.split('|');
        differences.push({company, table, dimension, field, expected: x.toString(), actual: y.toString()});
      }
    }
  }
  return differences;
}

/** Full verification of an imported state. */
export async function verifyImport(db, state) {
  const expected = checksumsFromState(state), actual = await checksumsFromDatabase(db);
  const differences = compareChecksums(expected, actual);
  const tables = new Set([...expected.keys()].map(key => key.split('|')[1]));
  return {ok: differences.length === 0, differences, keys: expected.size, tables: [...tables].sort()};
}

async function main(argv) {
  const file = argv.find(arg => !arg.startsWith('--'));
  if (!file || !process.env.SCORTA_DATABASE_URL) throw Error('Uso: SCORTA_DATABASE_URL=... node db/verify.mjs <platform.sqlite|estado.json>');
  const state = await readPlatformFile(resolve(file)), db = await openDatabase();
  try {
    const result = await verifyImport(db, state);
    console.log(`${result.keys} sumas de control en ${result.tables.length} tablas: ${result.ok ? '0 diferencias' : result.differences.length + ' diferencias'}`);
    if (!result.ok) { console.log(JSON.stringify(result.differences.slice(0, 100), null, 2)); process.exitCode = 2; }
  } finally { await db.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
