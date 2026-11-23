// DM-04: converts the current single JSON platform document (platform.sqlite, table
// `platform`, row id=1, column `data`, or a plain JSON file) into the normalized tables.
// Every field goes to a column; anything without a column goes to `extra jsonb`.
// The import runs in ONE transaction and refuses a target that already has data.
// CLI: node db/import-json.mjs <platform.sqlite|estado.json> [--verify]   (SCORTA_DATABASE_URL)
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {insertMany, openDatabase} from './client.mjs';
import {migrateUp} from './migrate.mjs';

const BOGOTA = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'});
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Same normalization as platform.mjs norm(): no accents, trimmed, lower case. */
export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
export const productSearchText = p => [p.nombre, p.referencia, p.marca, p.modelo, p.compatibilidad, p.codigo_barras, p.categoria]
  .map(normalizeSearch).filter(Boolean).join(' ');

const isoOrNull = value => {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
/** Business day: a YYYY-MM-DD value stays as is; a timestamp becomes its Bogotá day. */
export const businessDay = value => {
  if (typeof value === 'string' && DAY.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? BOGOTA.format(date) : null;
};
const json = value => value === undefined || value === null ? null : JSON.stringify(value);
const bool = value => value === true;
/** Unmapped keys -> extra jsonb (null when everything had a column). */
function extraOf(object, known) {
  const extra = {};
  for (const [key, value] of Object.entries(object || {})) if (!known.includes(key) && value !== undefined) extra[key] = value;
  return Object.keys(extra).length ? JSON.stringify(extra) : null;
}
/** A day column keeps the original value in extra when it had to be converted. */
function dayWithOriginal(row, key, value) {
  const day = businessDay(value);
  if (day !== value && value != null) row.__original = {...row.__original, [key]: value};
  return day;
}
const withOriginal = row => {
  if (!row.__original) return row;
  const extra = row.extra ? JSON.parse(row.extra) : {};
  extra.__original = row.__original;
  delete row.__original;
  return {...row, extra: JSON.stringify(extra)};
};

const LINE_KEYS = ['producto_id', 'nombre', 'cantidad', 'precio_unitario', 'costo_unitario', 'devuelto'];
const lineRow = (companyId, parentKey, parentId, line, index) => ({
  company_id: companyId, [parentKey]: parentId, line_no: index, producto_id: String(line.producto_id ?? ''), nombre: String(line.nombre ?? ''),
  cantidad: line.cantidad, precio_unitario: line.precio_unitario, costo_unitario: line.costo_unitario ?? null, devuelto: line.devuelto ?? 0,
  extra: extraOf(line, LINE_KEYS),
});
const REVERSAL_KEYS = ['id', 'fecha', 'usuario', 'motivo', 'parcial', 'detalles', 'fechaComercial', 'afterClosure'];
const reversalRows = (companyId, docType, doc) => (doc.reversiones || []).map((r, seq) => ({
  company_id: companyId, doc_type: docType, doc_id: doc.id, seq, id: String(r.id ?? seq), fecha: isoOrNull(r.fecha),
  fecha_comercial: r.fechaComercial ? businessDay(r.fechaComercial) : null, after_closure: bool(r.afterClosure), usuario: r.usuario ?? null,
  motivo: r.motivo ?? null, parcial: bool(r.parcial), detalles: json(r.detalles || []), extra: extraOf(r, REVERSAL_KEYS),
}));

/** Columns of every table, in insertion (foreign key) order. */
export const TABLE_COLUMNS = {
  platform_meta: ['id', 'schema_version', 'revision', 'owner_company', 'owner_contact', 'owner_origins', 'extra'],
  companies: ['id', 'name', 'slug', 'contact', 'nit', 'address', 'email', 'whatsapp', 'logo', 'start_date', 'end_date', 'monthly_fee', 'enabled', 'created_at', 'last_login_at', 'exported_at', 'business_revision', 'extra', 'business_extra'],
  terms_acceptances: ['company_id', 'version', 'accepted_at', 'user_id', 'username', 'name', 'extra'],
  users: ['id', 'company_id', 'username', 'name', 'email', 'email_verified', 'role', 'active', 'password_salt', 'password_digest', 'password_iterations', 'password_algorithm', 'password_changed_at', 'must_change_password', 'version', 'created_at', 'last_login_at', 'totp_enabled', 'totp_secret', 'totp_last_counter', 'totp_enabled_at', 'totp_pending_secret', 'totp_pending_at', 'extra'],
  sessions: ['token_hash', 'user_id', 'user_version', 'expires_at', 'support_company_id', 'support_reason', 'support_started_at', 'extra'],
  login_throttle: ['kind', 'key', 'count', 'until', 'alerted', 'extra'],
  idempotency_keys: ['user_id', 'request_id', 'fingerprint', 'company_id', 'created_at', 'result'],
  payments: ['id', 'company_id', 'date', 'amount', 'previous_end_date', 'start_date', 'end_date', 'username', 'extra'],
  security_events: ['id', 'fecha', 'tipo', 'company_id', 'details'],
  audit_log: ['scope', 'company_id', 'id', 'fecha', 'usuario', 'user_id', 'accion', 'documento', 'motivo', 'antes', 'despues', 'extra'],
  support_tickets: ['company_id', 'id', 'created_by', 'creator_name', 'title', 'description', 'status', 'created_at', 'updated_at', 'readers', 'extra'],
  ticket_messages: ['company_id', 'ticket_id', 'seq', 'id', 'user_id', 'name', 'role', 'message', 'kind', 'created_at', 'extra'],
  sale_drafts: ['company_id', 'user_id', 'support', 'version', 'draft', 'write_id', 'sale_id', 'updated_at', 'extra'],
  mechanics: ['company_id', 'id', 'name', 'percentage', 'active', 'created_at', 'updated_at', 'extra'],
  customers: ['company_id', 'id', 'nombre', 'telefono', 'consent_at', 'consent_by', 'consent_medium', 'erased_at', 'erased_by', 'extra'],
  products: ['company_id', 'id', 'nombre', 'search_text', 'categoria', 'referencia', 'marca', 'modelo', 'compatibilidad', 'codigo_barras', 'precio_compra', 'precio_venta', 'stock', 'stock_minimo', 'foto', 'extra'],
  product_cost_history: ['company_id', 'product_id', 'seq', 'kind', 'document_id', 'costo_unitario', 'costo_compra', 'cantidad', 'stock_antes', 'total', 'extra'],
  purchases: ['company_id', 'id', 'fecha', 'usuario', 'user_id', 'proveedor', 'total', 'anulada', 'estado_anterior', 'extra'],
  purchase_lines: ['company_id', 'purchase_id', 'line_no', 'producto_id', 'nombre', 'cantidad', 'precio_unitario', 'costo_unitario', 'devuelto', 'extra'],
  sales: ['company_id', 'id', 'fecha', 'usuario', 'user_id', 'cliente', 'telefono', 'customer_id', 'placa', 'payment_method', 'subtotal_productos', 'subtotal_mano_obra', 'total', 'labor_refund', 'anulada', 'autorizado_por', 'data_consent_at', 'data_consent_by', 'data_consent_medium', 'receipt_hash', 'receipt_expires_at', 'extra'],
  sale_lines: ['company_id', 'sale_id', 'line_no', 'producto_id', 'nombre', 'cantidad', 'precio_unitario', 'costo_unitario', 'devuelto', 'extra'],
  sale_labor: ['company_id', 'sale_id', 'line_no', 'descripcion', 'mecanico_id', 'mecanico', 'mecanico_porcentaje', 'importe', 'extra'],
  services: ['company_id', 'id', 'venta_id', 'fecha', 'fecha_entrega', 'usuario', 'user_id', 'cliente', 'telefono', 'customer_id', 'placa', 'marca_moto', 'descripcion_trabajo', 'mecanico', 'costo_mano_obra', 'subtotal_productos', 'subtotal_mano_obra', 'total', 'estado', 'estado_anterior', 'payment_method', 'anulada', 'labor', 'extra'],
  service_lines: ['company_id', 'service_id', 'line_no', 'producto_id', 'nombre', 'cantidad', 'precio_unitario', 'costo_unitario', 'devuelto', 'extra'],
  reversals: ['company_id', 'doc_type', 'doc_id', 'seq', 'id', 'fecha', 'fecha_comercial', 'after_closure', 'usuario', 'motivo', 'parcial', 'detalles', 'extra'],
  stock_movements: ['company_id', 'id', 'fecha', 'producto_id', 'nombre', 'cantidad', 'tipo', 'usuario', 'user_id', 'stock_antes', 'stock_despues', 'tipo_documento', 'documento', 'motivo', 'support_reason', 'extra'],
  cash_closures: ['company_id', 'id', 'date', 'created_at', 'user_id', 'username', 'name', 'expected_total', 'actual_total', 'difference_total', 'expected', 'actual', 'differences', 'summary', 'note', 'business_revision', 'extra'],
  receipts: ['token_hash', 'company_id', 'sale_id', 'expires_at', 'extra'],
};

const ROOT_KEYS = ['schemaVersion', 'revision', 'ownerCompany', 'ownerContact', 'ownerOrigins', 'companies', 'users', 'businesses', 'payments', 'requests', 'sessions', 'audit', 'receipts', 'loginFailures', 'loginOrigins', 'accountFailures', 'passwordFailures', 'securityEvents', 'supportTickets', 'saleDrafts'];
const COMPANY_KEYS = ['id', 'name', 'slug', 'contact', 'nit', 'address', 'email', 'whatsapp', 'logo', 'startDate', 'endDate', 'monthlyFee', 'enabled', 'createdAt', 'lastLoginAt', 'exportedAt', 'terms'];
const BUSINESS_KEYS = ['revision', 'prods', 'compras', 'ventas', 'servs', 'movimientos', 'auditoria', 'mechanics', 'cashClosures', 'customerRecords'];
const USER_KEYS = ['id', 'companyId', 'username', 'name', 'email', 'emailVerified', 'role', 'active', 'password', 'passwordChangedAt', 'mustChangePassword', 'version', 'createdAt', 'lastLoginAt', 'totp'];
const PRODUCT_KEYS = ['id', 'nombre', 'categoria', 'referencia', 'marca', 'modelo', 'compatibilidad', 'codigo_barras', 'precio_compra', 'precio_venta', 'stock', 'stock_minimo', 'foto', 'costHistory'];
const SALE_KEYS = ['id', 'fecha', 'usuario', 'userId', 'cliente', 'telefono', 'customerId', 'placa', 'paymentMethod', 'subtotal_productos', 'subtotal_mano_obra', 'total', 'laborRefund', 'anulada', 'autorizadoPor', 'dataConsent', 'receiptHash', 'receiptExpiresAt', 'detalles', 'labor', 'reversiones'];
const SERVICE_KEYS = ['id', 'venta_id', 'fecha', 'fecha_entrega', 'usuario', 'userId', 'cliente', 'telefono', 'customerId', 'placa', 'marca_moto', 'descripcion_trabajo', 'mecanico', 'costo_mano_obra', 'subtotal_productos', 'subtotal_mano_obra', 'total', 'estado', 'estado_anterior', 'paymentMethod', 'anulada', 'labor', 'detalles', 'reversiones'];
const PURCHASE_KEYS = ['id', 'fecha', 'usuario', 'userId', 'proveedor', 'total', 'anulada', 'estado_anterior', 'detalles', 'reversiones'];
const MOVEMENT_KEYS = ['id', 'fecha', 'producto_id', 'nombre', 'cantidad', 'tipo', 'usuario', 'userId', 'stock_antes', 'stock_despues', 'tipo_documento', 'documento', 'motivo', 'supportReason'];
const AUDIT_KEYS = ['id', 'fecha', 'usuario', 'userId', 'accion', 'companyId', 'documento', 'motivo', 'antes', 'despues'];
const CLOSURE_KEYS = ['id', 'date', 'createdAt', 'userId', 'username', 'name', 'expected', 'actual', 'differences', 'totals', 'summary', 'note', 'businessRevision'];
const THROTTLE = {loginFailures: 'login', loginOrigins: 'origin', accountFailures: 'account', passwordFailures: 'password'};

/**
 * Pure mapping: platform state -> {table: rows}. Arrays are inserted oldest first so
 * insertion order (and audit_log.seq) follows time; the JSON keeps newest first.
 */
export function mapPlatformState(input) {
  const state = JSON.parse(JSON.stringify(input)); // same shape as stored (undefined dropped)
  const t = Object.fromEntries(Object.keys(TABLE_COLUMNS).map(name => [name, []]));
  const companyIds = new Set((state.companies || []).map(c => c.id));
  t.platform_meta.push({id: 1, schema_version: state.schemaVersion ?? 1, revision: state.revision ?? 0, owner_company: state.ownerCompany ?? '',
    owner_contact: state.ownerContact ?? '', owner_origins: state.ownerOrigins || [], extra: extraOf(state, ROOT_KEYS)});

  for (const c of state.companies || []) {
    const business = state.businesses?.[c.id] || {};
    t.companies.push({id: c.id, name: c.name, slug: c.slug, contact: c.contact ?? '', nit: c.nit ?? '', address: c.address ?? '', email: c.email ?? '',
      whatsapp: c.whatsapp ?? '', logo: c.logo ?? '', start_date: c.startDate, end_date: c.endDate, monthly_fee: c.monthlyFee ?? 0, enabled: c.enabled !== false,
      created_at: isoOrNull(c.createdAt), last_login_at: isoOrNull(c.lastLoginAt), exported_at: isoOrNull(c.exportedAt), business_revision: business.revision ?? 0,
      extra: extraOf(c, COMPANY_KEYS), business_extra: extraOf(business, BUSINESS_KEYS)});
    if (c.terms) t.terms_acceptances.push({company_id: c.id, version: c.terms.version, accepted_at: isoOrNull(c.terms.acceptedAt), user_id: c.terms.userId ?? null,
      username: c.terms.username ?? null, name: c.terms.name ?? null, extra: extraOf(c.terms, ['version', 'acceptedAt', 'userId', 'username', 'name'])});
  }
  for (const id of Object.keys(state.businesses || {})) if (!companyIds.has(id)) throw Error(`El negocio ${id} no tiene empresa: revisa el estado antes de importar.`);

  for (const u of state.users || []) {
    const totp = u.totp || {};
    t.users.push({id: u.id, company_id: u.companyId ?? null, username: u.username, name: u.name ?? '', email: u.email ?? '', email_verified: bool(u.emailVerified),
      role: u.role, active: u.active !== false, password_salt: u.password?.salt, password_digest: u.password?.digest, password_iterations: u.password?.iterations,
      password_algorithm: u.password?.algorithm, password_changed_at: isoOrNull(u.passwordChangedAt), must_change_password: bool(u.mustChangePassword),
      version: u.version ?? 1, created_at: isoOrNull(u.createdAt), last_login_at: isoOrNull(u.lastLoginAt), totp_enabled: bool(totp.enabled),
      totp_secret: totp.secret ?? null, totp_last_counter: totp.lastCounter ?? null, totp_enabled_at: isoOrNull(totp.enabledAt),
      totp_pending_secret: totp.pendingSecret ?? null, totp_pending_at: isoOrNull(totp.pendingAt),
      extra: (() => {
        const extra = JSON.parse(extraOf(u, USER_KEYS) || '{}');
        const passwordExtra = JSON.parse(extraOf(u.password, ['salt', 'digest', 'iterations', 'algorithm']) || 'null');
        const totpExtra = JSON.parse(extraOf(u.totp, ['enabled', 'secret', 'lastCounter', 'enabledAt', 'pendingSecret', 'pendingAt']) || 'null');
        if (passwordExtra) extra.password = passwordExtra;
        if (totpExtra) extra.totp = totpExtra;
        return Object.keys(extra).length ? JSON.stringify(extra) : null;
      })()});
  }
  for (const [tokenHash, s] of Object.entries(state.sessions || {})) t.sessions.push({token_hash: tokenHash, user_id: s.userId, user_version: s.version ?? 1,
    expires_at: isoOrNull(s.expires), support_company_id: s.support?.companyId ?? null, support_reason: s.support?.reason ?? null,
    support_started_at: isoOrNull(s.support?.startedAt), extra: (() => {
      const extra = JSON.parse(extraOf(s, ['userId', 'version', 'expires', 'support']) || '{}'), supportExtra = s.support ? JSON.parse(extraOf(s.support, ['companyId', 'reason', 'startedAt']) || 'null') : null;
      if (supportExtra) extra.support = supportExtra;
      return Object.keys(extra).length ? JSON.stringify(extra) : null;
    })()});
  for (const [field, kind] of Object.entries(THROTTLE)) for (const [key, v] of Object.entries(state[field] || {})) t.login_throttle.push({kind, key,
    count: v?.count ?? 0, until: isoOrNull(v?.until), alerted: bool(v?.alerted), extra: extraOf(v, ['count', 'until', 'alerted'])});
  for (const [key, v] of Object.entries(state.requests || {})) {
    const split = key.indexOf('|');
    t.idempotency_keys.push({user_id: split < 0 ? key : key.slice(0, split), request_id: split < 0 ? '' : key.slice(split + 1), fingerprint: v?.fingerprint ?? '',
      company_id: null, created_at: isoOrNull(v?.createdAt) ?? new Date(0).toISOString(), result: extraOf(v, ['fingerprint', 'createdAt'])});
  }
  for (const p of [...(state.payments || [])].reverse()) t.payments.push({id: p.id, company_id: p.companyId, date: p.date, amount: p.amount, previous_end_date: p.previousEndDate ?? null,
    start_date: p.startDate ?? null, end_date: p.endDate ?? null, username: p.username ?? null, extra: extraOf(p, ['id', 'companyId', 'date', 'amount', 'previousEndDate', 'startDate', 'endDate', 'username'])});
  for (const e of [...(state.securityEvents || [])].reverse()) t.security_events.push({id: e.id, fecha: isoOrNull(e.fecha), tipo: e.tipo, company_id: e.companyId ?? null,
    details: extraOf(e, ['id', 'fecha', 'tipo', 'companyId'])});
  const auditRow = (scope, companyId, a) => ({scope, company_id: companyId ?? null, id: String(a.id ?? ''), fecha: isoOrNull(a.fecha), usuario: a.usuario ?? null,
    user_id: a.userId ?? null, accion: String(a.accion ?? ''), documento: a.documento == null ? null : String(a.documento), motivo: a.motivo ?? null,
    antes: json(a.antes), despues: json(a.despues), extra: extraOf(a, AUDIT_KEYS)});
  for (const a of [...(state.audit || [])].reverse()) t.audit_log.push(auditRow('platform', a.companyId, a));
  for (const ticket of [...(state.supportTickets || [])].reverse()) {
    t.support_tickets.push({company_id: ticket.companyId, id: ticket.id, created_by: ticket.createdBy ?? null, creator_name: ticket.creatorName ?? null, title: ticket.title,
      description: ticket.description, status: ticket.status, created_at: isoOrNull(ticket.createdAt), updated_at: isoOrNull(ticket.updatedAt), readers: json(ticket.readers || {}),
      extra: extraOf(ticket, ['companyId', 'id', 'createdBy', 'creatorName', 'title', 'description', 'status', 'createdAt', 'updatedAt', 'readers', 'messages'])});
    (ticket.messages || []).forEach((m, seq) => t.ticket_messages.push({company_id: ticket.companyId, ticket_id: ticket.id, seq, id: m.id, user_id: m.userId ?? null,
      name: m.name ?? null, role: m.role ?? null, message: m.message, kind: m.kind ?? null, created_at: isoOrNull(m.createdAt),
      extra: extraOf(m, ['id', 'userId', 'name', 'role', 'message', 'kind', 'createdAt'])}));
  }
  for (const [key, d] of Object.entries(state.saleDrafts || {})) {
    const [companyId, userId, support] = JSON.parse(key);
    t.sale_drafts.push({company_id: companyId, user_id: userId, support: !!support, version: d.version ?? 0, draft: json(d.draft), write_id: d.writeId ?? null,
      sale_id: d.saleId ?? null, updated_at: isoOrNull(d.updatedAt), extra: extraOf(d, ['version', 'draft', 'writeId', 'saleId', 'updatedAt'])});
  }

  for (const companyId of companyIds) {
    const b = state.businesses?.[companyId];
    if (!b) continue;
    for (const m of b.mechanics || []) t.mechanics.push({company_id: companyId, id: m.id, name: m.name, percentage: m.percentage ?? null, active: m.active !== false,
      created_at: isoOrNull(m.createdAt), updated_at: isoOrNull(m.updatedAt), extra: extraOf(m, ['id', 'name', 'percentage', 'active', 'createdAt', 'updatedAt'])});
    for (const c of b.customerRecords || []) t.customers.push({company_id: companyId, id: c.id, nombre: c.nombre ?? '', telefono: c.telefono ?? '',
      consent_at: isoOrNull(c.consentAt), consent_by: c.consentBy ?? null, consent_medium: c.consentMedium ?? null, erased_at: isoOrNull(c.erasedAt), erased_by: c.erasedBy ?? null,
      extra: extraOf(c, ['id', 'nombre', 'telefono', 'consentAt', 'consentBy', 'consentMedium', 'erasedAt', 'erasedBy'])});
    for (const p of b.prods || []) {
      t.products.push({company_id: companyId, id: p.id, nombre: p.nombre, search_text: productSearchText(p), categoria: p.categoria ?? 'General', referencia: p.referencia ?? '',
        marca: p.marca ?? '', modelo: p.modelo ?? '', compatibilidad: p.compatibilidad ?? '', codigo_barras: p.codigo_barras ?? '', precio_compra: p.precio_compra ?? null,
        precio_venta: p.precio_venta, stock: p.stock ?? 0, stock_minimo: p.stock_minimo ?? 0, foto: p.foto ?? null,
        extra: extraOf(p, PRODUCT_KEYS)});
      (p.costHistory || []).forEach((h, seq) => t.product_cost_history.push({company_id: companyId, product_id: p.id, seq, kind: h.kind, document_id: h.documentId ?? null,
        costo_unitario: h.costo_unitario ?? null, costo_compra: h.costo_compra ?? null, cantidad: h.cantidad ?? null, stock_antes: h.stock_antes ?? null, total: h.total ?? null,
        extra: extraOf(h, ['kind', 'documentId', 'costo_unitario', 'costo_compra', 'cantidad', 'stock_antes', 'total'])}));
    }
    for (const doc of [...(b.compras || [])].reverse()) {
      const row = {company_id: companyId, id: doc.id, usuario: doc.usuario ?? null, user_id: doc.userId ?? null, proveedor: doc.proveedor ?? 'Sin especificar',
        total: doc.total ?? 0, anulada: bool(doc.anulada), estado_anterior: doc.estado_anterior ?? null, extra: extraOf(doc, PURCHASE_KEYS)};
      row.fecha = dayWithOriginal(row, 'fecha', doc.fecha);
      t.purchases.push(withOriginal(row));
      (doc.detalles || []).forEach((line, index) => t.purchase_lines.push(lineRow(companyId, 'purchase_id', doc.id, line, index)));
      t.reversals.push(...reversalRows(companyId, 'compra', doc));
    }
    for (const sale of [...(b.ventas || [])].reverse()) {
      const consent = sale.dataConsent || {};
      const extra = JSON.parse(extraOf(sale, SALE_KEYS) || '{}'), consentExtra = JSON.parse(extraOf(sale.dataConsent, ['consentAt', 'consentBy', 'consentMedium']) || 'null');
      if (consentExtra) extra.dataConsent = consentExtra;
      const row = {company_id: companyId, id: sale.id, usuario: sale.usuario ?? null, user_id: sale.userId ?? null, cliente: sale.cliente ?? 'Cliente general',
        telefono: sale.telefono ?? '', customer_id: sale.customerId ?? null, placa: sale.placa ?? '', payment_method: sale.paymentMethod ?? null,
        subtotal_productos: sale.subtotal_productos ?? null, subtotal_mano_obra: sale.subtotal_mano_obra ?? null, total: sale.total ?? 0, labor_refund: sale.laborRefund ?? null,
        anulada: bool(sale.anulada), autorizado_por: sale.autorizadoPor ?? null, data_consent_at: isoOrNull(consent.consentAt), data_consent_by: consent.consentBy ?? null,
        data_consent_medium: consent.consentMedium ?? null, receipt_hash: sale.receiptHash ?? null, receipt_expires_at: isoOrNull(sale.receiptExpiresAt),
        extra: Object.keys(extra).length ? JSON.stringify(extra) : null};
      row.fecha = dayWithOriginal(row, 'fecha', sale.fecha);
      t.sales.push(withOriginal(row));
      (sale.detalles || []).forEach((line, index) => t.sale_lines.push(lineRow(companyId, 'sale_id', sale.id, line, index)));
      (sale.labor || []).forEach((l, index) => t.sale_labor.push({company_id: companyId, sale_id: sale.id, line_no: index, descripcion: l.descripcion ?? '',
        mecanico_id: l.mecanicoId ?? null, mecanico: l.mecanico ?? null, mecanico_porcentaje: l.mecanicoPorcentaje ?? null, importe: l.importe ?? 0,
        extra: extraOf(l, ['descripcion', 'mecanicoId', 'mecanico', 'mecanicoPorcentaje', 'importe'])}));
      t.reversals.push(...reversalRows(companyId, 'venta', sale));
    }
    for (const s of [...(b.servs || [])].reverse()) {
      const row = {company_id: companyId, id: s.id, venta_id: s.venta_id ?? null, fecha_entrega: s.fecha_entrega ? businessDay(s.fecha_entrega) : null,
        usuario: s.usuario ?? null, user_id: s.userId ?? null, cliente: s.cliente ?? 'Cliente general', telefono: s.telefono ?? '', customer_id: s.customerId ?? null,
        placa: s.placa ?? '', marca_moto: s.marca_moto ?? null, descripcion_trabajo: s.descripcion_trabajo ?? null, mecanico: s.mecanico ?? null,
        costo_mano_obra: s.costo_mano_obra ?? null, subtotal_productos: s.subtotal_productos ?? null, subtotal_mano_obra: s.subtotal_mano_obra ?? null, total: s.total ?? 0,
        estado: s.estado ?? 'pendiente', estado_anterior: s.estado_anterior ?? null, payment_method: s.paymentMethod ?? null, anulada: bool(s.anulada),
        labor: json(s.labor), extra: extraOf(s, SERVICE_KEYS)};
      row.fecha = dayWithOriginal(row, 'fecha', s.fecha);
      t.services.push(withOriginal(row));
      (s.detalles || []).forEach((line, index) => t.service_lines.push(lineRow(companyId, 'service_id', s.id, line, index)));
      t.reversals.push(...reversalRows(companyId, 'servicio', s));
    }
    for (const m of [...(b.movimientos || [])].reverse()) t.stock_movements.push({company_id: companyId, id: m.id, fecha: isoOrNull(m.fecha), producto_id: String(m.producto_id ?? ''),
      nombre: m.nombre ?? '', cantidad: m.cantidad ?? 0, tipo: m.tipo ?? '', usuario: m.usuario ?? null, user_id: m.userId ?? null, stock_antes: m.stock_antes ?? null,
      stock_despues: m.stock_despues ?? null, tipo_documento: m.tipo_documento ?? null, documento: m.documento == null ? null : String(m.documento), motivo: m.motivo ?? null,
      support_reason: m.supportReason ?? null, extra: extraOf(m, MOVEMENT_KEYS)});
    for (const a of [...(b.auditoria || [])].reverse()) t.audit_log.push(auditRow('business', companyId, a));
    for (const c of [...(b.cashClosures || [])].reverse()) t.cash_closures.push({company_id: companyId, id: c.id, date: c.date, created_at: isoOrNull(c.createdAt),
      user_id: c.userId ?? null, username: c.username ?? null, name: c.name ?? null, expected_total: c.totals?.expected ?? 0, actual_total: c.totals?.actual ?? 0,
      difference_total: c.totals?.difference ?? 0, expected: json(c.expected || {}), actual: json(c.actual || {}), differences: json(c.differences || {}),
      summary: json(c.summary), note: c.note ?? '', business_revision: c.businessRevision ?? null,
      extra: (() => {
        const extra = JSON.parse(extraOf(c, CLOSURE_KEYS) || '{}'), totalsExtra = JSON.parse(extraOf(c.totals, ['expected', 'actual', 'difference']) || 'null');
        if (totalsExtra) extra.totals = totalsExtra;
        return Object.keys(extra).length ? JSON.stringify(extra) : null;
      })()});
  }
  for (const [tokenHash, r] of Object.entries(state.receipts || {})) t.receipts.push({token_hash: tokenHash, company_id: r.companyId, sale_id: r.saleId,
    expires_at: isoOrNull(r.expires), extra: extraOf(r, ['companyId', 'saleId', 'expires'])});
  return t;
}

/** Reads the platform document from a platform.sqlite file or a JSON file. */
export async function readPlatformFile(file) {
  if (/\.json$/i.test(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const {DatabaseSync} = await import('node:sqlite');
  const db = new DatabaseSync(file, {readOnly: true});
  try {
    const row = db.prepare('SELECT data FROM platform WHERE id=1').get();
    if (!row) throw Error('El archivo no contiene la fila platform id=1.');
    return JSON.parse(row.data);
  } finally { db.close(); }
}

/** Imports a platform state into an empty, migrated database, in one transaction. */
export async function importPlatform(db, state, {log = () => {}} = {}) {
  const tables = mapPlatformState(state), counts = {};
  await db.transaction(async tx => {
    const {rows} = await tx.query('SELECT (SELECT count(*) FROM companies) + (SELECT count(*) FROM users) + (SELECT count(*) FROM platform_meta) AS n');
    if (Number(rows[0].n) > 0) throw Error('La base de destino ya tiene datos de SCORTA. La importación solo se hace sobre una base vacía.');
    for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
      counts[table] = await insertMany(tx, table, columns, tables[table]);
      log(`${table}: ${counts[table]}`);
    }
  });
  return counts;
}

async function main(argv) {
  const file = argv.find(arg => !arg.startsWith('--'));
  if (!file) throw Error('Uso: node db/import-json.mjs <platform.sqlite|estado.json> [--verify]');
  if (!process.env.SCORTA_DATABASE_URL) throw Error('Define SCORTA_DATABASE_URL.');
  const state = await readPlatformFile(resolve(file)), db = await openDatabase();
  try {
    await migrateUp(db, {log: console.log});
    const started = Date.now(), counts = await importPlatform(db, state, {log: console.log});
    console.log(`Importación completa en ${((Date.now() - started) / 1000).toFixed(1)} s`, counts);
    if (argv.includes('--verify')) {
      const {verifyImport} = await import('./verify.mjs');
      const result = await verifyImport(db, state);
      console.log(result.ok ? 'Verificación: 0 diferencias.' : `Verificación: ${result.differences.length} diferencias`, result.ok ? '' : JSON.stringify(result.differences.slice(0, 50), null, 2));
      if (!result.ok) process.exitCode = 2;
    }
  } finally { await db.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
