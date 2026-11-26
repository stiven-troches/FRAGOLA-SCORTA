// DM-04 / QA-16 / DM-12: control sums of an import, by company, by table and by date.
// Computes the same metrics twice, independently:
//   - from the original JSON state (plain JavaScript over the arrays, with the app's own rules), and
//   - from Postgres (SQL aggregates over the normalized tables),
// and lists every difference. Zero differences is the approval criterion of the migration.
// Money is compared in integer cents (BigInt); counts and quantities as integers.
// DM-12: covers every collection with its own table (cash movements, credit payments and balances,
// layaways, quotes, warranties, suppliers, purchase orders, supplier payments, split payments, VAT,
// discounts, refunds) and the cash book BY PAYMENT METHOD of every day (cashBook() of the app against
// the SQL cashReport()), which is what makes a cash closing match.
// CLI: node db/verify.mjs <platform.sqlite|estado.json>   (SCORTA_DATABASE_URL)
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDatabase} from './client.mjs';
import {businessDay, readPlatformFile} from './import-json.mjs';
import {PostgresRepository} from './repository.mjs';
import {CASH_ROW_KEYS, cashBook, saleRefunds} from '../caja-credito.mjs';
import {BASE_PAYMENT_KEYS, salePayments} from '../sale-pricing.mjs';

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
const array = value => Array.isArray(value) ? value : [];

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
  const userCompany = new Map(array(state.users).map(u => [u.id, u.companyId ?? null]));
  for (const u of state.users || []) s.add(u.companyId ?? PLATFORM, 'users', '*', {count: 1});
  s.add(PLATFORM, 'sessions', '*', {count: Object.keys(state.sessions || {}).length});
  s.add(PLATFORM, 'login_throttle', '*', {count: ['loginFailures', 'loginOrigins', 'accountFailures', 'passwordFailures'].reduce((n, f) => n + Object.keys(state[f] || {}).length, 0)});
  const companyIds = new Set(array(state.companies).map(c => c.id));
  for (const key of Object.keys(state.requests || {})) {
    const company = userCompany.get(key.includes('|') ? key.slice(0, key.indexOf('|')) : key);
    s.add(company && companyIds.has(company) ? company : PLATFORM, 'idempotency_keys', '*', {count: 1});
  }
  s.add(PLATFORM, 'security_events', '*', {count: (state.securityEvents || []).length});
  s.add(PLATFORM, 'audit_log.platform', '*', {count: (state.audit || []).length});
  for (const p of state.payments || []) s.add(p.companyId, 'payments', p.date, {count: 1, amount: cents(p.amount)});
  for (const r of Object.values(state.receipts || {})) s.add(r.companyId, 'receipts', '*', {count: 1});
  for (const t of state.supportTickets || []) s.add(t.companyId, 'support_tickets', '*', {count: 1, messages: (t.messages || []).length});
  for (const key of Object.keys(state.saleDrafts || {})) s.add(JSON.parse(key)[0], 'sale_drafts', '*', {count: 1});
  for (const c of state.companies || []) {
    const b = state.businesses?.[c.id] || {};
    s.add(c.id, 'companies', '*', {count: 1, revision: b.revision ?? 0, terms: c.terms ? 1 : 0, settings: b.settings ? 1 : 0});
    for (const p of b.prods || []) {
      s.add(c.id, 'products', '*', {count: 1, stock: int(p.stock), cost_history: (p.costHistory || []).length, sale_price: cents(p.precio_venta), reserved: int(p.stock_reservado), warranty: int(p.stock_garantia)});
      s.add(c.id, 'products.stock', p.id, {stock: int(p.stock)});
    }
    const lines = (lines = []) => lines.reduce((acc, l) => ({lines: acc.lines + 1n, qty: acc.qty + int(l.cantidad), returned: acc.returned + int(l.devuelto),
      amount: acc.amount + int(l.cantidad) * cents(l.precio_unitario)}), {lines: 0n, qty: 0n, returned: 0n, amount: 0n});
    for (const sale of b.ventas || []) {
      const labor = sale.labor || [], day = businessDay(sale.fecha);
      s.add(c.id, 'sales', day, {count: 1, total: cents(sale.total), cancelled: sale.anulada ? 1 : 0, ...lines(sale.detalles),
        labor_lines: labor.length, labor: labor.reduce((n, l) => n + cents(l.importe), 0n), reversals: (sale.reversiones || []).length,
        discounts: cents(sale.descuentos), discount_total: cents(sale.descuento_total), vat: cents(sale.iva?.total), vat_rows: array(sale.iva?.tarifas).length,
        credit: sale.credito ? 1 : 0, credit_amount: cents(sale.credito?.monto), credit_balance: cents(sale.credito?.saldo), credit_paid: cents(sale.credito?.pagado)});
      for (const payment of salePayments(sale)) s.add(c.id, 'sale_payments', `${day}/${payment.method}`, {count: 1, amount: cents(payment.amount)});
      array(sale.reversiones).forEach((reversal, index) => {
        for (const payment of saleRefunds(sale)[index]?.pagos || []) s.add(c.id, 'reversal_refunds', `${saleRefunds(sale)[index].fecha}/${payment.method}`, {count: 1, amount: cents(payment.amount)});
      });
    }
    for (const doc of b.compras || []) s.add(c.id, 'purchases', businessDay(doc.fecha), {count: 1, total: cents(doc.total), cancelled: doc.anulada ? 1 : 0, ...lines(doc.detalles), reversals: (doc.reversiones || []).length});
    for (const sv of b.servs || []) {
      s.add(c.id, 'services', businessDay(sv.fecha), {count: 1, total: cents(sv.total), cancelled: sv.anulada ? 1 : 0, ...lines(sv.detalles), reversals: (sv.reversiones || []).length});
      for (const reversal of array(sv.reversiones)) for (const payment of array(reversal.reembolso?.pagos)) s.add(c.id, 'reversal_refunds.servicio', `${reversal.fechaComercial || businessDay(reversal.fecha)}/${payment.method}`, {count: 1, amount: cents(payment.amount)});
    }
    for (const m of b.movimientos || []) s.add(c.id, 'stock_movements', BOGOTA.format(new Date(m.fecha)), {count: 1, qty: int(m.cantidad)});
    for (const cl of b.cashClosures || []) s.add(c.id, 'cash_closures', cl.date, {count: 1, expected: cents(cl.totals?.expected), actual: cents(cl.totals?.actual), difference: cents(cl.totals?.difference)});
    const customers = b.customerRecords || [];
    s.add(c.id, 'customers', '*', {count: customers.length, credit_limit: customers.reduce((n, r) => n + cents(r.creditLimit), 0n), favor: customers.reduce((n, r) => n + cents(r.saldoAFavor), 0n)});
    s.add(c.id, 'mechanics', '*', {count: (b.mechanics || []).length});
    s.add(c.id, 'audit_log.business', '*', {count: (b.auditoria || []).length});
    // DM-12: colecciones con tabla propia.
    for (const m of b.cashMovements || []) {
      s.add(c.id, 'cash_movements', `${m.fecha}/${m.tipo}`, {count: 1, amount: cents(m.amount)});
      s.add(c.id, 'cash_movements.method', `${m.fecha}/${m.method || 'efectivo'}`, {count: 1, amount: cents(m.amount)});
    }
    for (const p of b.creditPayments || []) {
      s.add(c.id, 'credit_payments', `${p.fecha}/${p.method}`, {count: 1, amount: cents(p.amount), apps: array(p.aplicado).length, applied: array(p.aplicado).reduce((n, a) => n + cents(a.amount), 0n)});
    }
    for (const l of b.layaways || []) {
      s.add(c.id, 'layaways', l.estado, {count: 1, total: cents(l.total), paid: cents(l.pagado), balance: cents(l.saldo), lines: array(l.detalles).length, qty: array(l.detalles).reduce((n, x) => n + int(x.cantidad), 0n),
        payments: array(l.abonos).length, refund: cents(l.cancelacion?.reembolso), favor: cents(l.cancelacion?.saldoAFavor), sale_link: l.saleId ? 1 : 0});
      for (const p of array(l.abonos)) s.add(c.id, 'layaway_payments', `${p.fecha}/${p.method}`, {count: 1, amount: cents(p.amount)});
    }
    for (const q of b.quotes || []) {
      s.add(c.id, 'quotes', q.estado, {count: 1, total: cents(q.total), gross: cents(q.bruto), discounts: cents(q.descuentos), vat: cents(q.iva?.total), lines: array(q.detalles).length,
        qty: array(q.detalles).reduce((n, x) => n + int(x.cantidad), 0n), converted: q.saleId ? 1 : 0});
    }
    for (const w of b.warranties || []) s.add(c.id, 'warranties', w.estado, {count: 1, qty: int(w.cantidad), in_warranty: int(w.enGarantia), history: array(w.historial).length, decided: w.decision ? 1 : 0});
    s.add(c.id, 'suppliers', '*', {count: (b.suppliers || []).length});
    for (const o of b.purchaseOrders || []) {
      s.add(c.id, 'purchase_orders', o.estado, {count: 1, total: cents(o.total), lines: array(o.items).length, qty: array(o.items).reduce((n, x) => n + int(x.cantidad), 0n),
        received: array(o.items).reduce((n, x) => n + int(x.recibido), 0n), receipts: array(o.recepciones).length, history: array(o.historial).length});
    }
    for (const p of b.supplierPayments || []) {
      s.add(c.id, 'supplier_payments', `${p.fecha}/${p.method}`, {count: 1, amount: cents(p.amount), apps: array(p.aplicado).length, applied: array(p.aplicado).reduce((n, a) => n + cents(a.amount), 0n)});
    }
    const payable = (b.compras || []).filter(doc => doc.credito);
    s.add(c.id, 'purchase_credit', '*', {count: payable.length, amount: payable.reduce((n, d) => n + cents(d.credito.monto), 0n), balance: payable.reduce((n, d) => n + cents(d.credito.saldo), 0n), paid: payable.reduce((n, d) => n + cents(d.credito.pagado), 0n)});
  }
  return s.map;
}

/** Control sums from the normalized Postgres tables. */
export async function checksumsFromDatabase(db) {
  const s = new Sums(), q = async sql => (await db.query(sql)).rows;
  for (const r of await q(`SELECT coalesce(company_id, '${PLATFORM}') AS c, count(*) AS n FROM users GROUP BY 1`)) s.add(r.c, 'users', '*', {count: r.n});
  s.add(PLATFORM, 'sessions', '*', {count: (await q('SELECT count(*) AS n FROM sessions'))[0].n});
  s.add(PLATFORM, 'login_throttle', '*', {count: (await q('SELECT count(*) AS n FROM login_throttle'))[0].n});
  for (const r of await q(`SELECT coalesce(company_id, '${PLATFORM}') AS c, count(*) AS n FROM idempotency_keys GROUP BY 1`)) s.add(r.c, 'idempotency_keys', '*', {count: r.n});
  s.add(PLATFORM, 'security_events', '*', {count: (await q('SELECT count(*) AS n FROM security_events'))[0].n});
  s.add(PLATFORM, 'audit_log.platform', '*', {count: (await q(`SELECT count(*) AS n FROM audit_log WHERE scope = 'platform'`))[0].n});
  for (const r of await q('SELECT company_id, date::text AS d, count(*) AS n, sum(amount)::text AS amount FROM payments GROUP BY 1, 2')) s.add(r.company_id, 'payments', r.d, {count: r.n, amount: cents(r.amount)});
  for (const r of await q('SELECT company_id, count(*) AS n FROM receipts GROUP BY 1')) s.add(r.company_id, 'receipts', '*', {count: r.n});
  for (const r of await q(`SELECT t.company_id, count(*) AS n, coalesce(sum((SELECT count(*) FROM ticket_messages m WHERE m.company_id = t.company_id AND m.ticket_id = t.id)), 0) AS m
    FROM support_tickets t GROUP BY 1`)) s.add(r.company_id, 'support_tickets', '*', {count: r.n, messages: r.m});
  for (const r of await q('SELECT company_id, count(*) AS n FROM sale_drafts GROUP BY 1')) s.add(r.company_id, 'sale_drafts', '*', {count: r.n});
  for (const r of await q(`SELECT c.id, c.business_revision AS rev, (SELECT count(*) FROM terms_acceptances t WHERE t.company_id = c.id) AS terms, (c.settings IS NOT NULL)::int AS settings FROM companies c`))
    s.add(r.id, 'companies', '*', {count: 1, revision: r.rev, terms: r.terms, settings: r.settings});
  for (const r of await q(`SELECT company_id, count(*) AS n, coalesce(sum(stock), 0) AS stock, sum(precio_venta)::text AS price, coalesce(sum(stock_reservado), 0) AS reserved, coalesce(sum(stock_garantia), 0) AS warranty,
    (SELECT count(*) FROM product_cost_history h WHERE h.company_id = p.company_id) AS h FROM products p GROUP BY company_id`))
    s.add(r.company_id, 'products', '*', {count: r.n, stock: r.stock, cost_history: r.h, sale_price: cents(r.price), reserved: r.reserved, warranty: r.warranty});
  for (const r of await q('SELECT company_id, id, stock FROM products')) s.add(r.company_id, 'products.stock', r.id, {stock: r.stock});

  const documentSums = async (table, linesTable, parentKey, docType, extraSelect = '', extraJoin = '') => {
    const rows = await q(`SELECT d.company_id, d.fecha::text AS d, count(*) AS n, sum(d.total)::text AS total, count(*) FILTER (WHERE d.anulada) AS cancelled,
        coalesce(sum(l.lines), 0) AS lines, coalesce(sum(l.qty), 0) AS qty, coalesce(sum(l.returned), 0) AS returned, coalesce(sum(l.amount), 0)::text AS amount,
        coalesce(sum(r.n), 0) AS reversals ${extraSelect}
      FROM ${table} d
      LEFT JOIN LATERAL (SELECT count(*) AS lines, sum(cantidad) AS qty, sum(devuelto) AS returned, sum(cantidad * precio_unitario) AS amount
        FROM ${linesTable} x WHERE x.company_id = d.company_id AND x.${parentKey} = d.id) l ON true
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM reversals v WHERE v.company_id = d.company_id AND v.doc_type = '${docType}' AND v.doc_id = d.id) r ON true
      ${extraJoin}
      GROUP BY 1, 2`);
    for (const r of rows) {
      const fields = {count: r.n, total: cents(r.total), cancelled: r.cancelled, lines: r.lines, qty: r.qty, returned: r.returned, amount: cents(r.amount), reversals: r.reversals};
      if (table === 'sales') Object.assign(fields, {labor_lines: r.labor_lines, labor: cents(r.labor), discounts: cents(r.discounts), discount_total: cents(r.discount_total), vat: cents(r.vat), vat_rows: r.vat_rows,
        credit: r.credit, credit_amount: cents(r.credit_amount), credit_balance: cents(r.credit_balance), credit_paid: cents(r.credit_paid)});
      s.add(r.company_id, table, r.d, fields);
    }
  };
  await documentSums('sales', 'sale_lines', 'sale_id', 'venta', `, coalesce(sum(lb.lines), 0) AS labor_lines, coalesce(sum(lb.amount), 0)::text AS labor,
      coalesce(sum(d.descuentos), 0)::text AS discounts, coalesce(sum(d.descuento_total), 0)::text AS discount_total, coalesce(sum(d.iva_total), 0)::text AS vat, coalesce(sum(vr.n), 0) AS vat_rows,
      count(sc.sale_id) AS credit, coalesce(sum(sc.monto), 0)::text AS credit_amount, coalesce(sum(sc.saldo), 0)::text AS credit_balance, coalesce(sum(sc.pagado), 0)::text AS credit_paid`,
  `LEFT JOIN LATERAL (SELECT count(*) AS lines, sum(importe) AS amount FROM sale_labor sl WHERE sl.company_id = d.company_id AND sl.sale_id = d.id) lb ON true
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM sale_vat_rates vx WHERE vx.company_id = d.company_id AND vx.sale_id = d.id) vr ON true
      LEFT JOIN sale_credit sc ON sc.company_id = d.company_id AND sc.sale_id = d.id`);
  await documentSums('purchases', 'purchase_lines', 'purchase_id', 'compra');
  await documentSums('services', 'service_lines', 'service_id', 'servicio');
  for (const r of await q(`SELECT s.company_id, s.fecha::text AS d, x.method, count(*) AS n, sum(x.amount)::text AS amount FROM sales s
    JOIN sale_payment_lines x ON x.company_id = s.company_id AND x.sale_id = s.id GROUP BY 1, 2, 3`)) s.add(r.company_id, 'sale_payments', `${r.d}/${r.method}`, {count: r.n, amount: cents(r.amount)});
  for (const r of await q(`SELECT r.company_id, r.doc_type, coalesce(r.fecha_comercial, (r.fecha AT TIME ZONE 'America/Bogota')::date)::text AS d, f.method, count(*) AS n, sum(f.amount)::text AS amount
    FROM reversals r JOIN reversal_refunds f ON f.company_id = r.company_id AND f.doc_type = r.doc_type AND f.doc_id = r.doc_id AND f.seq = r.seq GROUP BY 1, 2, 3, 4`))
    s.add(r.company_id, r.doc_type === 'venta' ? 'reversal_refunds' : 'reversal_refunds.' + r.doc_type, `${r.d}/${r.method}`, {count: r.n, amount: cents(r.amount)});
  for (const r of await q('SELECT company_id, fecha_comercial::text AS d, count(*) AS n, sum(cantidad) AS qty FROM stock_movements GROUP BY 1, 2'))
    s.add(r.company_id, 'stock_movements', r.d, {count: r.n, qty: r.qty});
  for (const r of await q('SELECT company_id, date::text AS d, count(*) AS n, sum(expected_total)::text AS e, sum(actual_total)::text AS a, sum(difference_total)::text AS f FROM cash_closures GROUP BY 1, 2'))
    s.add(r.company_id, 'cash_closures', r.d, {count: r.n, expected: cents(r.e), actual: cents(r.a), difference: cents(r.f)});
  const perCompany = async (table, sql) => {
    const found = new Map((await q(sql)).map(r => [r.company_id, r.n]));
    for (const {id} of await q('SELECT id FROM companies')) s.add(id, table, '*', {count: found.get(id) ?? 0});
  };
  await perCompany('mechanics', 'SELECT company_id, count(*) AS n FROM mechanics GROUP BY 1');
  await perCompany('audit_log.business', `SELECT company_id, count(*) AS n FROM audit_log WHERE scope = 'business' GROUP BY 1`);
  await perCompany('suppliers', 'SELECT company_id, count(*) AS n FROM suppliers GROUP BY 1');
  const customers = new Map((await q(`SELECT company_id, count(*) AS n, coalesce(sum(credit_limit), 0)::text AS credit_limit, coalesce(sum(saldo_a_favor), 0)::text AS favor FROM customers GROUP BY 1`)).map(r => [r.company_id, r]));
  const payable = new Map((await q(`SELECT company_id, count(*) AS n, coalesce(sum(monto), 0)::text AS amount, coalesce(sum(saldo), 0)::text AS balance, coalesce(sum(pagado), 0)::text AS paid FROM purchase_credit GROUP BY 1`)).map(r => [r.company_id, r]));
  for (const {id} of await q('SELECT id FROM companies')) {
    const c = customers.get(id), p = payable.get(id);
    s.add(id, 'customers', '*', {count: c?.n ?? 0, credit_limit: cents(c?.credit_limit), favor: cents(c?.favor)});
    s.add(id, 'purchase_credit', '*', {count: p?.n ?? 0, amount: cents(p?.amount), balance: cents(p?.balance), paid: cents(p?.paid)});
  }
  for (const r of await q('SELECT company_id, fecha::text AS d, tipo, count(*) AS n, sum(amount)::text AS amount FROM cash_movements GROUP BY 1, 2, 3')) s.add(r.company_id, 'cash_movements', `${r.d}/${r.tipo}`, {count: r.n, amount: cents(r.amount)});
  for (const r of await q('SELECT company_id, fecha::text AS d, method, count(*) AS n, sum(amount)::text AS amount FROM cash_movements GROUP BY 1, 2, 3')) s.add(r.company_id, 'cash_movements.method', `${r.d}/${r.method}`, {count: r.n, amount: cents(r.amount)});
  for (const r of await q(`SELECT p.company_id, p.fecha::text AS d, p.method, count(*) AS n, sum(p.amount)::text AS amount, coalesce(sum(a.n), 0) AS apps, coalesce(sum(a.amount), 0)::text AS applied
    FROM credit_payments p LEFT JOIN LATERAL (SELECT count(*) AS n, sum(amount) AS amount FROM credit_payment_applications x WHERE x.company_id = p.company_id AND x.payment_id = p.id) a ON true GROUP BY 1, 2, 3`))
    s.add(r.company_id, 'credit_payments', `${r.d}/${r.method}`, {count: r.n, amount: cents(r.amount), apps: r.apps, applied: cents(r.applied)});
  for (const r of await q(`SELECT l.company_id, l.estado, count(*) AS n, sum(l.total)::text AS total, sum(l.pagado)::text AS paid, sum(l.saldo)::text AS balance, coalesce(sum(x.n), 0) AS lines, coalesce(sum(x.qty), 0) AS qty,
      coalesce(sum(y.n), 0) AS payments, coalesce(sum(l.cancel_reembolso), 0)::text AS refund, coalesce(sum(l.cancel_saldo_a_favor), 0)::text AS favor, count(l.sale_id) AS sale_link
    FROM layaways l LEFT JOIN LATERAL (SELECT count(*) AS n, sum(cantidad) AS qty FROM layaway_lines z WHERE z.company_id = l.company_id AND z.layaway_id = l.id) x ON true
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM layaway_payments z WHERE z.company_id = l.company_id AND z.layaway_id = l.id) y ON true GROUP BY 1, 2`))
    s.add(r.company_id, 'layaways', r.estado, {count: r.n, total: cents(r.total), paid: cents(r.paid), balance: cents(r.balance), lines: r.lines, qty: r.qty, payments: r.payments, refund: cents(r.refund), favor: cents(r.favor), sale_link: r.sale_link});
  for (const r of await q('SELECT company_id, fecha::text AS d, method, count(*) AS n, sum(amount)::text AS amount FROM layaway_payments GROUP BY 1, 2, 3')) s.add(r.company_id, 'layaway_payments', `${r.d}/${r.method}`, {count: r.n, amount: cents(r.amount)});
  for (const r of await q(`SELECT q.company_id, q.estado, count(*) AS n, sum(q.total)::text AS total, coalesce(sum(q.bruto), 0)::text AS gross, coalesce(sum(q.descuentos), 0)::text AS discounts, coalesce(sum(q.iva_total), 0)::text AS vat,
      coalesce(sum(x.n), 0) AS lines, coalesce(sum(x.qty), 0) AS qty, count(q.sale_id) AS converted
    FROM quotes q LEFT JOIN LATERAL (SELECT count(*) AS n, sum(cantidad) AS qty FROM quote_lines z WHERE z.company_id = q.company_id AND z.quote_id = q.id) x ON true GROUP BY 1, 2`))
    s.add(r.company_id, 'quotes', r.estado, {count: r.n, total: cents(r.total), gross: cents(r.gross), discounts: cents(r.discounts), vat: cents(r.vat), lines: r.lines, qty: r.qty, converted: r.converted});
  for (const r of await q(`SELECT w.company_id, w.estado, count(*) AS n, sum(w.cantidad) AS qty, coalesce(sum(w.en_garantia), 0) AS in_warranty, coalesce(sum(x.n), 0) AS history, count(w.decision) AS decided
    FROM warranties w LEFT JOIN LATERAL (SELECT count(*) AS n FROM warranty_history z WHERE z.company_id = w.company_id AND z.warranty_id = w.id) x ON true GROUP BY 1, 2`))
    s.add(r.company_id, 'warranties', r.estado, {count: r.n, qty: r.qty, in_warranty: r.in_warranty, history: r.history, decided: r.decided});
  for (const r of await q(`SELECT o.company_id, o.estado, count(*) AS n, sum(o.total)::text AS total, coalesce(sum(l.n), 0) AS lines, coalesce(sum(l.qty), 0) AS qty, coalesce(sum(l.received), 0) AS received,
      coalesce(sum(rc.n), 0) AS receipts, coalesce(sum(h.n), 0) AS history
    FROM purchase_orders o LEFT JOIN LATERAL (SELECT count(*) AS n, sum(cantidad) AS qty, sum(recibido) AS received FROM purchase_order_lines z WHERE z.company_id = o.company_id AND z.order_id = o.id) l ON true
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM purchase_order_receipts z WHERE z.company_id = o.company_id AND z.order_id = o.id) rc ON true
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM purchase_order_history z WHERE z.company_id = o.company_id AND z.order_id = o.id) h ON true GROUP BY 1, 2`))
    s.add(r.company_id, 'purchase_orders', r.estado, {count: r.n, total: cents(r.total), lines: r.lines, qty: r.qty, received: r.received, receipts: r.receipts, history: r.history});
  for (const r of await q(`SELECT p.company_id, p.fecha::text AS d, p.method, count(*) AS n, sum(p.amount)::text AS amount, coalesce(sum(a.n), 0) AS apps, coalesce(sum(a.amount), 0)::text AS applied
    FROM supplier_payments p LEFT JOIN LATERAL (SELECT count(*) AS n, sum(amount) AS amount FROM supplier_payment_applications x WHERE x.company_id = p.company_id AND x.payment_id = p.id) a ON true GROUP BY 1, 2, 3`))
    s.add(r.company_id, 'supplier_payments', `${r.d}/${r.method}`, {count: r.n, amount: cents(r.amount), apps: r.apps, applied: cents(r.applied)});
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

/** A day without movements still lists the three base methods (as cashBook() does). */
const emptyBook = () => ({rows: Object.fromEntries(BASE_PAYMENT_KEYS.map(key => [key, Object.fromEntries(CASH_ROW_KEYS.map(name => [name, 0]))])),
  expected: Object.fromEntries(BASE_PAYMENT_KEYS.map(key => [key, 0])), creditSales: 0, layawaySales: 0, favorSales: 0});

/** Days with money movement of a company in the JSON state (every day cashBook() could list). */
function cashDays(business) {
  const days = new Set();
  const day = value => { const d = businessDay(value); if (d) days.add(d); };
  for (const sale of array(business.ventas)) { day(sale.fecha); for (const refund of saleRefunds(sale)) if (refund.fecha) days.add(refund.fecha); }
  for (const service of array(business.servs)) if (!service.venta_id && !service.saleId && !service.documento && (service.estado === 'entregado' || service.anulada && service.estado_anterior === 'entregado')) day(service.fecha_entrega || service.fecha);
  for (const p of array(business.creditPayments)) day(p.fecha);
  for (const m of array(business.cashMovements)) day(m.fecha);
  for (const l of array(business.layaways)) { for (const p of array(l.abonos)) day(p.fecha); if (l.cancelacion?.fecha) day(l.cancelacion.fecha); }
  return [...days].sort();
}

/**
 * Cash book BY PAYMENT METHOD, day by day: the app's cashBook() over the JSON against the SQL
 * cashReport() over the tables. Every row (base, ventas, abonos, separados, ingresos, gastos,
 * retiros, devoluciones) and the expected total per method must match.
 */
export async function cashChecksums(db, state) {
  const expected = new Sums(), actual = new Sums(), repo = new PostgresRepository(db);
  const book = (sums, company, date, entry) => {
    for (const [method, row] of Object.entries(entry.rows)) {
      const fields = Object.fromEntries(CASH_ROW_KEYS.map(key => [key, cents(row[key])]));
      sums.add(company, 'cash.book', `${date}/${method}`, {...fields, expected: cents(entry.expected[method]), listed: 1});
    }
    sums.add(company, 'cash.sales', date, {credit: cents(entry.creditSales), layaway: cents(entry.layawaySales), favor: cents(entry.favorSales)});
  };
  for (const c of state.companies || []) {
    const business = state.businesses?.[c.id] || {}, days = cashDays(business);
    if (!days.length) continue;
    const from = days[0], to = days.at(-1), report = await repo.forCompany(c.id).cashReport({from, to});
    const all = new Set([...days, ...Object.keys(report.days)]);
    for (const date of all) {
      book(expected, c.id, date, cashBook(business, date));
      book(actual, c.id, date, report.days[date] ?? emptyBook());
    }
  }
  return {expected: expected.map, actual: actual.map};
}

/** Full verification of an imported state. */
export async function verifyImport(db, state, {cash = true} = {}) {
  const expected = checksumsFromState(state), actual = await checksumsFromDatabase(db);
  if (cash) {
    const book = await cashChecksums(db, state);
    for (const [key, value] of book.expected) expected.set(key, value);
    for (const [key, value] of book.actual) actual.set(key, value);
  }
  const differences = compareChecksums(expected, actual);
  const tables = new Set([...expected.keys()].map(key => key.split('|')[1]));
  return {ok: differences.length === 0, differences, keys: expected.size, tables: [...tables].sort()};
}

async function main(argv) {
  const file = argv.find(arg => !arg.startsWith('--'));
  if (!file || !process.env.SCORTA_DATABASE_URL) throw Error('Uso: SCORTA_DATABASE_URL=... node db/verify.mjs <platform.sqlite|estado.json> [--no-cash]');
  const state = await readPlatformFile(resolve(file)), db = await openDatabase();
  try {
    const result = await verifyImport(db, state, {cash: !argv.includes('--no-cash')});
    console.log(`${result.keys} sumas de control en ${result.tables.length} tablas: ${result.ok ? '0 diferencias' : result.differences.length + ' diferencias'}`);
    if (!result.ok) { console.log(JSON.stringify(result.differences.slice(0, 100), null, 2)); process.exitCode = 2; }
  } finally { await db.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
