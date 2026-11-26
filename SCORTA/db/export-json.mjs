// DM-12: exportador inverso. Reconstruye el documento JSON de la plataforma (la forma de
// platform.sqlite) desde las tablas normalizadas, para el plan de reversa del corte a Postgres
// (PLAN-CORTE, paso 7) y para comprobar que el modelo no pierde nada (importar -> exportar ->
// comparar, tests/pg-modelo-completo.test.mjs). Es el inverso exacto de db/import-json.mjs.
// Los arreglos salen en el orden del JSON (más nuevo primero) gracias a la columna `seq`.
// CLI: node db/export-json.mjs <salida.json>   (SCORTA_DATABASE_URL)
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDatabase} from './client.mjs';
import {SALE_IVA, SALE_NEW, SPECS, unmapFields, unmapRecord} from './spec.mjs';

const THROTTLE_FIELDS = {login: 'loginFailures', origin: 'loginOrigins', account: 'accountFailures', password: 'passwordFailures'};
const num = value => value == null ? value : Number(value);
/** Sesiones, comprobantes y límites guardan marcas de tiempo en milisegundos (número). */
const epoch = value => value == null ? value : Date.parse(value);
const put = (object, key, value) => { if (value !== null && value !== undefined) object[key] = value; };
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const groupBy = (rows, keyOf) => {
  const map = new Map();
  for (const row of rows) { const key = keyOf(row); (map.get(key) ?? map.set(key, []).get(key)).push(row); }
  return map;
};
/** Quita las claves que el JSON original no traía (el esquema las llenó con su valor por defecto). */
const dropAbsent = (out, absent) => { for (const key of absent || []) delete out[key]; return out; };
const withDay = (target, key, row, column, extra) => {
  if (Object.hasOwn(object(extra.__original), key)) target[key] = extra.__original[key];
  else put(target, key, row[column]);
};

export async function exportPlatform(db) {
  const q = async sql => (await db.query(sql)).rows;
  const all = {};
  for (const table of ['platform_meta', 'companies', 'terms_acceptances', 'users', 'sessions', 'login_throttle', 'idempotency_keys', 'payments', 'security_events', 'audit_log', 'support_tickets',
    'ticket_messages', 'sale_drafts', 'mechanics', 'customers', 'products', 'product_cost_history', 'suppliers', 'purchases', 'purchase_credit', 'purchase_lines', 'sales', 'sale_lines', 'sale_labor',
    'sale_payments', 'sale_vat_rates', 'sale_credit', 'services', 'service_lines', 'reversals', 'reversal_refunds', 'stock_movements', 'cash_closures', 'receipts', 'cash_movements', 'credit_payments',
    'credit_payment_applications', 'layaways', 'layaway_lines', 'layaway_payments', 'quotes', 'quote_lines', 'warranties', 'warranty_history', 'purchase_orders', 'purchase_order_lines',
    'purchase_order_receipts', 'purchase_order_history', 'supplier_payments', 'supplier_payment_applications']) {
    // seq = orden del JSON; las tablas hijas se ordenan por su posición.
    const order = {audit_log: 'seq', ticket_messages: 'company_id, ticket_id, seq', product_cost_history: 'company_id, product_id, seq', purchase_lines: 'company_id, purchase_id, line_no', sale_lines: 'company_id, sale_id, line_no',
      sale_labor: 'company_id, sale_id, line_no', sale_payments: 'company_id, sale_id, line_no', sale_vat_rates: 'company_id, sale_id, line_no', service_lines: 'company_id, service_id, line_no',
      reversals: 'company_id, doc_type, doc_id, seq', reversal_refunds: 'company_id, doc_type, doc_id, seq, line_no', credit_payment_applications: 'company_id, payment_id, line_no', layaway_lines: 'company_id, layaway_id, line_no',
      layaway_payments: 'company_id, layaway_id, line_no', quote_lines: 'company_id, quote_id, line_no', warranty_history: 'company_id, warranty_id, seq', purchase_order_lines: 'company_id, order_id, line_no',
      purchase_order_receipts: 'company_id, order_id, seq', purchase_order_history: 'company_id, order_id, seq', supplier_payment_applications: 'company_id, payment_id, line_no'};
    const noOrder = ['platform_meta', 'sessions', 'login_throttle', 'idempotency_keys', 'sale_drafts', 'receipts', 'terms_acceptances', 'purchase_credit', 'sale_credit'];
    all[table] = await q(`SELECT * FROM ${table}${noOrder.includes(table) ? '' : ` ORDER BY ${order[table] || 'seq'}`}`);
  }
  const reverse = rows => [...rows].reverse();

  const meta = all.platform_meta[0];
  const state = {};
  if (meta) {
    Object.assign(state, {schemaVersion: meta.schema_version, revision: num(meta.revision), ownerCompany: meta.owner_company, ownerContact: meta.owner_contact, ownerOrigins: meta.owner_origins});
    Object.assign(state, object(meta.extra));
  }

  // ---- plataforma
  const terms = groupBy(all.terms_acceptances, r => r.company_id);
  state.companies = all.companies.map(c => {
    const out = {id: c.id, name: c.name, slug: c.slug, contact: c.contact, nit: c.nit, address: c.address, email: c.email, whatsapp: c.whatsapp, logo: c.logo, startDate: c.start_date, endDate: c.end_date,
      monthlyFee: num(c.monthly_fee), enabled: c.enabled};
    put(out, 'createdAt', c.created_at); put(out, 'lastLoginAt', c.last_login_at); put(out, 'exportedAt', c.exported_at);
    const term = terms.get(c.id)?.[0];
    if (term) out.terms = {version: term.version, acceptedAt: term.accepted_at, ...(term.user_id != null ? {userId: term.user_id} : {}), ...(term.username != null ? {username: term.username} : {}),
      ...(term.name != null ? {name: term.name} : {}), ...object(term.extra)};
    return {...out, ...object(c.extra)};
  });
  state.users = all.users.map(u => {
    const extra = object(u.extra), {password: passwordExtra, totp: totpExtra, ...rest} = extra;
    const out = {id: u.id, companyId: u.company_id, username: u.username, name: u.name, email: u.email, emailVerified: u.email_verified, role: u.role, active: u.active,
      password: {salt: u.password_salt, digest: u.password_digest, iterations: u.password_iterations, algorithm: u.password_algorithm, ...object(passwordExtra)}};
    put(out, 'passwordChangedAt', u.password_changed_at);
    if (u.must_change_password) out.mustChangePassword = true;
    out.version = u.version;
    put(out, 'createdAt', u.created_at); put(out, 'lastLoginAt', u.last_login_at);
    const totp = {};
    if (u.totp_enabled) totp.enabled = true;
    put(totp, 'secret', u.totp_secret); put(totp, 'lastCounter', u.totp_last_counter == null ? null : num(u.totp_last_counter)); put(totp, 'enabledAt', u.totp_enabled_at);
    put(totp, 'pendingSecret', u.totp_pending_secret); put(totp, 'pendingAt', u.totp_pending_at);
    Object.assign(totp, object(totpExtra));
    if (Object.keys(totp).length || totpExtra !== undefined) out.totp = {enabled: u.totp_enabled, ...totp};
    return {...out, ...rest};
  });
  state.sessions = Object.fromEntries(all.sessions.map(s => {
    const extra = object(s.extra), {support: supportExtra, ...rest} = extra, out = {userId: s.user_id, version: s.user_version, expires: epoch(s.expires_at)};
    const support = {};
    put(support, 'companyId', s.support_company_id); put(support, 'reason', s.support_reason); put(support, 'startedAt', s.support_started_at);
    Object.assign(support, object(supportExtra));
    if (Object.keys(support).length) out.support = support;
    return [s.token_hash, {...out, ...rest}];
  }));
  for (const row of all.login_throttle) {
    const field = THROTTLE_FIELDS[row.kind];
    (state[field] ??= {})[row.key] = {count: row.count, until: epoch(row.until), ...(row.alerted ? {alerted: true} : {}), ...object(row.extra)};
  }
  for (const field of Object.values(THROTTLE_FIELDS)) state[field] ??= {};
  state.requests = Object.fromEntries(all.idempotency_keys.map(k => [k.request_id === '' ? k.user_id : `${k.user_id}|${k.request_id}`, {fingerprint: k.fingerprint, createdAt: k.created_at, ...object(k.result)}]));
  state.payments = reverse(all.payments).map(p => {
    const out = {id: p.id, companyId: p.company_id, date: p.date, amount: num(p.amount)};
    put(out, 'previousEndDate', p.previous_end_date); put(out, 'startDate', p.start_date); put(out, 'endDate', p.end_date); put(out, 'username', p.username);
    return {...out, ...object(p.extra)};
  });
  state.securityEvents = reverse(all.security_events).map(e => ({id: e.id, fecha: e.fecha, tipo: e.tipo, ...(e.company_id != null ? {companyId: e.company_id} : {}), ...object(e.details)}));
  const auditOut = a => {
    const out = {id: a.id, fecha: a.fecha};
    put(out, 'usuario', a.usuario); put(out, 'userId', a.user_id); out.accion = a.accion; put(out, 'documento', a.documento); put(out, 'motivo', a.motivo);
    put(out, 'antes', a.antes); put(out, 'despues', a.despues);
    return {...out, ...object(a.extra)};
  };
  state.audit = reverse(all.audit_log.filter(a => a.scope === 'platform')).map(a => ({...auditOut(a), ...(a.company_id != null ? {companyId: a.company_id} : {})}));
  const messages = groupBy(all.ticket_messages, m => m.company_id + '\u0000' + m.ticket_id);
  state.supportTickets = reverse(all.support_tickets).map(t => {
    const out = {companyId: t.company_id, id: t.id};
    put(out, 'createdBy', t.created_by); put(out, 'creatorName', t.creator_name);
    Object.assign(out, {title: t.title, description: t.description, status: t.status, createdAt: t.created_at, updatedAt: t.updated_at, readers: t.readers});
    out.messages = (messages.get(t.company_id + '\u0000' + t.id) || []).map(m => {
      const message = {id: m.id};
      put(message, 'userId', m.user_id); put(message, 'name', m.name); put(message, 'role', m.role); message.message = m.message; put(message, 'kind', m.kind); put(message, 'createdAt', m.created_at);
      return {...message, ...object(m.extra)};
    });
    return {...out, ...object(t.extra)};
  });
  state.saleDrafts = Object.fromEntries(all.sale_drafts.map(d => {
    const out = {version: d.version};
    put(out, 'draft', d.draft); put(out, 'writeId', d.write_id); put(out, 'saleId', d.sale_id); put(out, 'updatedAt', d.updated_at);
    return [JSON.stringify([d.company_id, d.user_id, d.support]), {...out, ...object(d.extra)}];
  }));
  state.receipts = Object.fromEntries(all.receipts.map(r => [r.token_hash, {companyId: r.company_id, saleId: r.sale_id, expires: epoch(r.expires_at), ...object(r.extra)}]));

  // ---- negocio
  const by = table => groupBy(all[table], r => r.company_id);
  const group = (table, parentKey) => groupBy(all[table], r => r.company_id + '\u0000' + r[parentKey]);
  const of = (map, companyId) => map.get(companyId) || [];
  const m = {mechanics: by('mechanics'), customers: by('customers'), products: by('products'), suppliers: by('suppliers'), purchases: by('purchases'), sales: by('sales'), services: by('services'),
    movements: by('stock_movements'), closures: by('cash_closures'), cashMovements: by('cash_movements'), creditPayments: by('credit_payments'), layaways: by('layaways'), quotes: by('quotes'),
    warranties: by('warranties'), orders: by('purchase_orders'), supplierPayments: by('supplier_payments'), audit: groupBy(all.audit_log.filter(a => a.scope === 'business'), a => a.company_id)};
  const history = group('product_cost_history', 'product_id'), purchaseLines = group('purchase_lines', 'purchase_id'), saleLines = group('sale_lines', 'sale_id'), saleLabor = group('sale_labor', 'sale_id'),
    salePayments = group('sale_payments', 'sale_id'), saleRates = group('sale_vat_rates', 'sale_id'), serviceLines = group('service_lines', 'service_id');
  const credits = new Map(all.sale_credit.map(r => [r.company_id + '\u0000' + r.sale_id, r])), purchaseCredits = new Map(all.purchase_credit.map(r => [r.company_id + '\u0000' + r.purchase_id, r]));
  const reversals = groupBy(all.reversals, r => `${r.company_id}\u0000${r.doc_type}\u0000${r.doc_id}`), refunds = groupBy(all.reversal_refunds, r => `${r.company_id}\u0000${r.doc_type}\u0000${r.doc_id}\u0000${r.seq}`);
  const creditApps = group('credit_payment_applications', 'payment_id'), layawayLines = group('layaway_lines', 'layaway_id'), layawayPayments = group('layaway_payments', 'layaway_id'),
    quoteLines = group('quote_lines', 'quote_id'), warrantyHistory = group('warranty_history', 'warranty_id'), orderLines = group('purchase_order_lines', 'order_id'),
    orderReceipts = group('purchase_order_receipts', 'order_id'), orderHistory = group('purchase_order_history', 'order_id'), supplierApps = group('supplier_payment_applications', 'payment_id');

  const lineOut = (l, known = []) => {
    const out = {producto_id: l.producto_id, nombre: l.nombre, cantidad: l.cantidad, precio_unitario: num(l.precio_unitario)};
    put(out, 'costo_unitario', num(l.costo_unitario));
    if (l.costo_unitario === null) out.costo_unitario = null;
    if (l.devuelto > 0) out.devuelto = l.devuelto;
    for (const key of known) put(out, key, num(l[key]));
    return {...out, ...object(l.extra)};
  };
  const reversalsOf = (companyId, docType, docId) => (reversals.get(`${companyId}\u0000${docType}\u0000${docId}`) || []).map(r => {
    const extra = object(r.extra), {reembolso: refundExtra, ...rest} = extra, out = {id: r.id, fecha: r.fecha};
    put(out, 'usuario', r.usuario); put(out, 'motivo', r.motivo); out.parcial = r.parcial; out.detalles = r.detalles;
    put(out, 'fechaComercial', r.fecha_comercial);
    if (r.after_closure) out.afterClosure = true;
    put(out, 'garantiaId', r.garantia_id);
    if (r.refund_total !== null && !r.refund_derived) {
      const pagos = (refunds.get(`${companyId}\u0000${docType}\u0000${docId}\u0000${r.seq}`) || []).map(p => ({method: p.method, amount: num(p.amount), ...object(p.extra)}));
      out.reembolso = {total: num(r.refund_total), credito: num(r.refund_credit), ...(pagos.length || !Object.hasOwn(object(refundExtra), 'pagos') ? {pagos} : {}), ...object(refundExtra)};
    }
    return {...out, ...rest};
  });
  const creditOut = row => row && {monto: num(row.monto), saldo: num(row.saldo), pagado: num(row.pagado), ...(row.plazo_dias != null ? {plazoDias: row.plazo_dias} : {}), ...(row.vence != null ? {vence: row.vence} : {}), ...object(row.extra)};

  state.businesses = {};
  for (const c of all.companies) {
    const id = c.id, business = {revision: num(c.business_revision)};
    business.prods = of(m.products, id).map(p => {
      const out = {id: p.id, nombre: p.nombre, categoria: p.categoria, referencia: p.referencia, marca: p.marca, modelo: p.modelo, compatibilidad: p.compatibilidad, codigo_barras: p.codigo_barras,
        precio_compra: num(p.precio_compra), precio_venta: num(p.precio_venta), stock: p.stock, stock_minimo: p.stock_minimo};
      put(out, 'foto', p.foto); put(out, 'descripcion', p.descripcion); put(out, 'stock_reservado', p.stock_reservado); put(out, 'stock_garantia', p.stock_garantia);
      put(out, 'garantia_dias', p.garantia_dias); put(out, 'tarifa_iva', num(p.tarifa_iva)); put(out, 'precios', p.precios);
      const costHistory = (history.get(id + '\u0000' + p.id) || []).map(h => {
        const entry = {kind: h.kind};
        put(entry, 'documentId', h.document_id); put(entry, 'costo_unitario', num(h.costo_unitario)); put(entry, 'costo_compra', num(h.costo_compra)); put(entry, 'cantidad', h.cantidad);
        put(entry, 'stock_antes', h.stock_antes); put(entry, 'total', num(h.total));
        return {...entry, ...object(h.extra)};
      });
      if (costHistory.length) out.costHistory = costHistory;
      const {__absent, ...rest} = object(p.extra);
      return {...dropAbsent(out, __absent), ...rest};
    });
    business.compras = reverse(of(m.purchases, id)).map(p => {
      const extra = object(p.extra), out = {id: p.id};
      withDay(out, 'fecha', p, 'fecha', extra);
      put(out, 'usuario', p.usuario); put(out, 'userId', p.user_id); out.proveedor = p.proveedor; out.total = num(p.total);
      if (p.anulada) out.anulada = true;
      put(out, 'estado_anterior', p.estado_anterior); put(out, 'supplierId', p.supplier_id); put(out, 'factura', p.factura); put(out, 'ordenCompraId', p.orden_compra_id); put(out, 'ordenCompraNumero', p.orden_compra_numero);
      const credit = creditOut(purchaseCredits.get(id + '\u0000' + p.id));
      if (credit) out.credito = credit;
      out.detalles = (purchaseLines.get(id + '\u0000' + p.id) || []).map(l => lineOut(l));
      const rev = reversalsOf(id, 'compra', p.id);
      if (rev.length) out.reversiones = rev;
      const {__original, ...rest} = extra;
      return {...out, ...rest};
    });
    business.ventas = reverse(of(m.sales, id)).map(s => {
      const extra = object(s.extra), {dataConsent: consentExtra, iva: ivaExtra, __original, __absent, payments_raw: paymentsRaw, ...rest} = extra, out = {id: s.id};
      withDay(out, 'fecha', s, 'fecha', extra);
      put(out, 'usuario', s.usuario); put(out, 'userId', s.user_id); out.cliente = s.cliente; out.telefono = s.telefono; put(out, 'customerId', s.customer_id); out.placa = s.placa;
      put(out, 'paymentMethod', s.payment_method); put(out, 'subtotal_productos', num(s.subtotal_productos)); put(out, 'subtotal_mano_obra', num(s.subtotal_mano_obra)); out.total = num(s.total);
      put(out, 'laborRefund', num(s.labor_refund));
      if (s.anulada) out.anulada = true;
      put(out, 'autorizadoPor', s.autorizado_por);
      const consent = {};
      put(consent, 'consentAt', s.data_consent_at); put(consent, 'consentBy', s.data_consent_by); put(consent, 'consentMedium', s.data_consent_medium);
      Object.assign(consent, object(consentExtra));
      if (Object.keys(consent).length) out.dataConsent = consent;
      put(out, 'receiptHash', s.receipt_hash); put(out, 'receiptExpiresAt', s.receipt_expires_at);
      Object.assign(out, unmapFields(SALE_NEW, s, extra), unmapFields(SALE_IVA, s, {...(ivaExtra ? {iva: ivaExtra} : {}), ...(__original ? {__original} : {})}));
      const rates = (saleRates.get(id + '\u0000' + s.id) || []).map(r => ({tarifa: num(r.tarifa), total: num(r.total), base: num(r.base), iva: num(r.iva), ...object(r.extra)}));
      if (rates.length) out.iva = {...out.iva, tarifas: rates};
      if (paymentsRaw !== undefined) out.payments = paymentsRaw;
      else {
        const payments = (salePayments.get(id + '\u0000' + s.id) || []).map(p => ({method: p.method, amount: num(p.amount), ...object(p.extra)}));
        if (payments.length) out.payments = payments;
      }
      const credit = creditOut(credits.get(id + '\u0000' + s.id));
      if (credit) out.credito = credit;
      out.detalles = (saleLines.get(id + '\u0000' + s.id) || []).map(l => lineOut(l, ['precio_lista', 'precio_modificado', 'descuento', 'tarifa_iva']));
      const labor = (saleLabor.get(id + '\u0000' + s.id) || []).map(l => {
        const entry = {descripcion: l.descripcion};
        put(entry, 'mecanicoId', l.mecanico_id); put(entry, 'mecanico', l.mecanico); put(entry, 'mecanicoPorcentaje', num(l.mecanico_porcentaje)); entry.importe = num(l.importe);
        return {...entry, ...object(l.extra)};
      });
      out.labor = labor;
      const rev = reversalsOf(id, 'venta', s.id);
      if (rev.length) out.reversiones = rev;
      return {...dropAbsent(out, __absent), ...rest};
    });
    business.servs = reverse(of(m.services, id)).map(s => {
      const extra = object(s.extra), {__original, __absent, ...rest} = extra, out = {id: s.id};
      put(out, 'venta_id', s.venta_id); withDay(out, 'fecha', s, 'fecha', extra); withDay(out, 'fecha_entrega', s, 'fecha_entrega', extra);
      put(out, 'usuario', s.usuario); put(out, 'userId', s.user_id); out.cliente = s.cliente; out.telefono = s.telefono; put(out, 'customerId', s.customer_id); out.placa = s.placa;
      put(out, 'marca_moto', s.marca_moto); put(out, 'descripcion_trabajo', s.descripcion_trabajo); put(out, 'mecanico', s.mecanico); put(out, 'costo_mano_obra', num(s.costo_mano_obra));
      put(out, 'subtotal_productos', num(s.subtotal_productos)); put(out, 'subtotal_mano_obra', num(s.subtotal_mano_obra)); out.total = num(s.total); out.estado = s.estado;
      put(out, 'estado_anterior', s.estado_anterior); put(out, 'paymentMethod', s.payment_method);
      if (s.anulada) out.anulada = true;
      put(out, 'labor', s.labor);
      out.detalles = (serviceLines.get(id + '\u0000' + s.id) || []).map(l => lineOut(l));
      const rev = reversalsOf(id, 'servicio', s.id);
      if (rev.length) out.reversiones = rev;
      return {...dropAbsent(out, __absent), ...rest};
    });
    business.movimientos = reverse(of(m.movements, id)).map(x => {
      const out = {id: x.id, fecha: x.fecha, producto_id: x.producto_id, nombre: x.nombre, cantidad: x.cantidad, tipo: x.tipo};
      put(out, 'usuario', x.usuario); put(out, 'userId', x.user_id); put(out, 'stock_antes', x.stock_antes); put(out, 'stock_despues', x.stock_despues);
      put(out, 'tipo_documento', x.tipo_documento); put(out, 'documento', x.documento); put(out, 'motivo', x.motivo); put(out, 'supportReason', x.support_reason);
      return {...out, ...object(x.extra)};
    });
    business.auditoria = reverse(of(m.audit, id)).map(auditOut);
    business.mechanics = of(m.mechanics, id).map(x => {
      const out = {id: x.id, name: x.name, percentage: num(x.percentage), active: x.active};
      put(out, 'createdAt', x.created_at); put(out, 'updatedAt', x.updated_at);
      return {...out, ...object(x.extra)};
    });
    business.cashClosures = reverse(of(m.closures, id)).map(x => {
      const extra = object(x.extra), {totals: totalsExtra, ...rest} = extra, out = {id: x.id, date: x.date, createdAt: x.created_at};
      put(out, 'userId', x.user_id); put(out, 'username', x.username); put(out, 'name', x.name);
      Object.assign(out, {expected: x.expected, actual: x.actual, differences: x.differences, totals: {expected: num(x.expected_total), actual: num(x.actual_total), difference: num(x.difference_total), ...object(totalsExtra)}});
      put(out, 'summary', x.summary); out.note = x.note; put(out, 'businessRevision', num(x.business_revision));
      return {...out, ...rest};
    });
    business.customerRecords = of(m.customers, id).map(x => {
      const out = {id: x.id, nombre: x.nombre, telefono: x.telefono};
      put(out, 'consentAt', x.consent_at); put(out, 'consentBy', x.consent_by); put(out, 'consentMedium', x.consent_medium); put(out, 'erasedAt', x.erased_at); put(out, 'erasedBy', x.erased_by);
      put(out, 'tipo', x.tipo); put(out, 'tipoDocumento', x.tipo_documento); put(out, 'numeroDocumento', x.numero_documento); put(out, 'correo', x.correo);
      put(out, 'creditLimit', num(x.credit_limit)); put(out, 'creditDays', x.credit_days); put(out, 'saldoAFavor', num(x.saldo_a_favor));
      return {...out, ...object(x.extra)};
    });
    // Colecciones con tabla propia (migración 002): solo si tienen filas.
    const optional = (key, value) => { if (Array.isArray(value) ? value.length : value != null) business[key] = value; };
    optional('suppliers', of(m.suppliers, id).map(r => unmapRecord(SPECS.suppliers, r)));
    optional('cashMovements', reverse(of(m.cashMovements, id)).map(r => unmapRecord(SPECS.cash_movements, r)));
    optional('creditPayments', reverse(of(m.creditPayments, id)).map(r => ({...unmapRecord(SPECS.credit_payments, r),
      aplicado: (creditApps.get(id + '\u0000' + r.id) || []).map(a => unmapRecord(SPECS.credit_payment_applications, a))})));
    optional('layaways', reverse(of(m.layaways, id)).map(r => ({...unmapRecord(SPECS.layaways, r),
      detalles: (layawayLines.get(id + '\u0000' + r.id) || []).map(l => unmapRecord(SPECS.layaway_lines, l)),
      abonos: (layawayPayments.get(id + '\u0000' + r.id) || []).map(p => unmapRecord(SPECS.layaway_payments, p))})));
    optional('quotes', reverse(of(m.quotes, id)).map(r => ({...unmapRecord(SPECS.quotes, r), detalles: (quoteLines.get(id + '\u0000' + r.id) || []).map(l => unmapRecord(SPECS.quote_lines, l))})));
    optional('warranties', reverse(of(m.warranties, id)).map(r => ({...unmapRecord(SPECS.warranties, r), historial: (warrantyHistory.get(id + '\u0000' + r.id) || []).map(h => unmapRecord(SPECS.warranty_history, h))})));
    optional('purchaseOrders', reverse(of(m.orders, id)).map(r => ({...unmapRecord(SPECS.purchase_orders, r),
      items: (orderLines.get(id + '\u0000' + r.id) || []).map(l => unmapRecord(SPECS.purchase_order_lines, l)),
      recepciones: (orderReceipts.get(id + '\u0000' + r.id) || []).map(x => unmapRecord(SPECS.purchase_order_receipts, x)),
      historial: (orderHistory.get(id + '\u0000' + r.id) || []).map(h => unmapRecord(SPECS.purchase_order_history, h))})));
    optional('supplierPayments', reverse(of(m.supplierPayments, id)).map(r => ({...unmapRecord(SPECS.supplier_payments, r),
      aplicado: (supplierApps.get(id + '\u0000' + r.id) || []).map(a => unmapRecord(SPECS.supplier_payment_applications, a))})));
    if (c.settings != null) business.settings = c.settings;
    if (c.sequences != null) business.secuencias = c.sequences;
    Object.assign(business, object(c.business_extra));
    state.businesses[id] = business;
  }
  return state;
}

async function main(argv) {
  const file = argv.find(arg => !arg.startsWith('--'));
  if (!file || !process.env.SCORTA_DATABASE_URL) throw Error('Uso: SCORTA_DATABASE_URL=... node db/export-json.mjs <salida.json>');
  const db = await openDatabase();
  try {
    const state = await exportPlatform(db);
    writeFileSync(resolve(file), JSON.stringify(state));
    console.log(`Exportado a ${resolve(file)}: ${state.companies.length} empresas, ${state.users.length} usuarios.`);
  } finally { await db.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
