// BE-24: data repository interface the application will use, and its Postgres
// implementation. NOT wired into the app yet (see docs/datos/PLAN-CORTE.md).
//
// Tenant isolation (SEG-12): every business operation goes through
// `repo.forCompany(companyId)`, which refuses an empty id and binds company_id as $1 of
// every statement. Child tables reference (company_id, parent_id), so even a buggy
// statement cannot attach a row of company A to a document of company B.
import {moneyAmount, roundMoney, sumMoney} from '../money.mjs';
import {normalizeSearch} from './import-json.mjs';

/**
 * @typedef {object} PlatformRepository                      (global, not per company)
 * @property {(s:{tokenHash:string,userId:string,userVersion:number,expiresAt:string|Date,support?:object}) => Promise<void>} createSession
 * @property {(tokenHash:string, now?:Date|string) => Promise<object|null>} getSession   active session + its user, or null
 * @property {(tokenHash:string) => Promise<boolean>} deleteSession
 * @property {(q:{userId?:string,companyId?:string,exceptTokenHash?:string}) => Promise<number>} revokeSessions
 * @property {(now?:Date|string) => Promise<number>} purgeExpiredSessions
 * @property {(h:{kind:string,key:string,windowMs:number,now?:Date|string}) => Promise<{count:number,until:string}>} hitThrottle
 * @property {(kind:string, key:string) => Promise<void>} clearThrottle
 * @property {(k:{userId:string,requestId:string,fingerprint:string,companyId?:string}) => Promise<{status:'new'|'replay',result:object|null}>} claimRequest
 * @property {(companyId:string) => CompanyRepository} forCompany
 *
 * @typedef {object} CompanyRepository                       (every method scoped to one company)
 * @property {(q:{q?:string,limit?:number,after?:{nombre:string,id:string},includeCost?:boolean}) => Promise<{items:object[],next:object|null}>} searchProducts
 * @property {(id:string) => Promise<object|null>} getProduct
 * @property {(q:{from?:string,to?:string,limit?:number,before?:{fecha:string,id:string},userId?:string}) => Promise<{items:object[],next:object|null}>} listSales
 * @property {(id:string) => Promise<object|null>} getSale
 * @property {(sale:object) => Promise<{sale:object,replayed:boolean}>} createSale
 * @property {(q:{from:string,to:string}) => Promise<object>} salesReport
 */

const METHODS = ['efectivo', 'transferencia', 'tarjeta'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fail = (message, status = 400, code = 'INVALID_OPERATION') => { throw Object.assign(Error(message), {status, code}); };
const iso = value => new Date(value ?? Date.now()).toISOString();
const likeEscape = value => value.replace(/[\\%_]/g, char => '\\' + char);
const num = value => value == null ? null : Number(value);
const validDay = (value, label) => {
  if (typeof value !== 'string' || !DAY.test(value) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail(`${label}: fecha inválida`);
  return value;
};

/** Postgres implementation of PlatformRepository / CompanyRepository. */
export class PostgresRepository {
  /** @param {{query:Function,transaction:Function}} db from db/client.mjs */
  constructor(db) { this.db = db; }

  forCompany(companyId) {
    if (typeof companyId !== 'string' || !companyId.trim()) fail('company_id obligatorio para operar datos de una empresa', 403, 'COMPANY_REQUIRED');
    return new CompanyScope(this.db, companyId);
  }

  // ------------------------------------------------------------ sessions (BE-31)
  async createSession({tokenHash, userId, userVersion, expiresAt, support = null}) {
    await this.db.query(`INSERT INTO sessions(token_hash, user_id, user_version, expires_at, support_company_id, support_reason, support_started_at)
      VALUES($1, $2, $3, $4, $5, $6, $7)`, [tokenHash, userId, userVersion, iso(expiresAt), support?.companyId ?? null, support?.reason ?? null, support?.startedAt ? iso(support.startedAt) : null]);
  }

  async getSession(tokenHash, now) {
    const {rows} = await this.db.query(`SELECT s.token_hash, s.user_id, s.expires_at, s.support_company_id, s.support_reason, s.support_started_at,
        u.username, u.name, u.role, u.company_id, u.version, u.must_change_password, u.totp_enabled
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.active AND u.version = s.user_version`, [tokenHash, iso(now)]);
    return rows[0] ?? null;
  }

  async deleteSession(tokenHash) {
    return (await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])).rowCount > 0;
  }

  async revokeSessions({userId = null, companyId = null, exceptTokenHash = null} = {}) {
    const {rowCount} = await this.db.query(`DELETE FROM sessions s WHERE ($1::text IS NULL OR s.user_id = $1)
        AND ($2::text IS NULL OR s.support_company_id = $2 OR s.user_id IN (SELECT id FROM users WHERE company_id = $2))
        AND ($3::text IS NULL OR s.token_hash <> $3)`, [userId, companyId, exceptTokenHash]);
    return rowCount;
  }

  async purgeExpiredSessions(now) {
    return (await this.db.query('DELETE FROM sessions WHERE expires_at <= $1', [iso(now)])).rowCount;
  }

  // ------------------------------------------------------------ login limits (BE-31)
  /** Counts one attempt inside a fixed window; a finished window starts again at 1. */
  async hitThrottle({kind, key, windowMs, now}) {
    const at = iso(now), until = iso(new Date(at).getTime() + windowMs);
    const {rows} = await this.db.query(`INSERT INTO login_throttle AS t (kind, key, count, until) VALUES($1, $2, 1, $3)
      ON CONFLICT (kind, key) DO UPDATE SET
        count = CASE WHEN t.until > $4 THEN t.count + 1 ELSE 1 END,
        until = CASE WHEN t.until > $4 THEN t.until ELSE $3 END,
        alerted = CASE WHEN t.until > $4 THEN t.alerted ELSE false END
      RETURNING count, until`, [kind, key, until, at]);
    return rows[0];
  }

  async clearThrottle(kind, key) { await this.db.query('DELETE FROM login_throttle WHERE kind = $1 AND key = $2', [kind, key]); }

  // ------------------------------------------------------------ idempotency
  /** Global form, outside a business transaction (e.g. owner actions). */
  claimRequest(input) { return claimRequest(this.db, input); }
}

/** INSERT ... ON CONFLICT DO NOTHING: the first request wins; the same id with other data is rejected. */
async function claimRequest(db, {userId, requestId, fingerprint, companyId = null, now}) {
  const inserted = await db.query(`INSERT INTO idempotency_keys(user_id, request_id, fingerprint, company_id, created_at)
    VALUES($1, $2, $3, $4, $5) ON CONFLICT (user_id, request_id) DO NOTHING RETURNING user_id`, [userId, requestId, fingerprint, companyId, iso(now)]);
  if (inserted.rowCount) return {status: 'new', result: null};
  const {rows} = await db.query('SELECT fingerprint, result FROM idempotency_keys WHERE user_id = $1 AND request_id = $2', [userId, requestId]);
  if (rows[0].fingerprint !== fingerprint) fail('El identificador de operación ya fue usado con otros datos', 409, 'IDEMPOTENCY_CONFLICT');
  return {status: 'replay', result: rows[0].result};
}

class CompanyScope {
  constructor(db, companyId) { this.db = db; this.companyId = companyId; }

  // ------------------------------------------------------------ products (BE-28, DM-05)
  /**
   * Paginated search. Each word of `q` must appear in search_text (name, reference,
   * brand, model, compatibility, barcode, category; no accents). Keyset pagination by
   * (lower(nombre), id). The cost is returned only with includeCost (administrators).
   */
  async searchProducts({q = '', limit = 50, after = null, includeCost = false} = {}) {
    const size = Math.min(Math.max(1, Number(limit) || 50), 200), params = [this.companyId], where = ['company_id = $1'];
    for (const word of normalizeSearch(q).split(/\s+/).filter(Boolean).slice(0, 8)) {
      params.push('%' + likeEscape(word) + '%');
      where.push(`search_text LIKE $${params.length}`);
    }
    if (after) {
      params.push(String(after.nombre).toLowerCase(), after.id);
      where.push(`(lower(nombre), id) > ($${params.length - 1}, $${params.length})`);
    }
    params.push(size + 1);
    const {rows} = await this.db.query(`SELECT id, nombre, categoria, referencia, marca, modelo, compatibilidad, codigo_barras,
        ${includeCost ? 'precio_compra,' : ''} precio_venta, stock, stock_minimo
      FROM products WHERE ${where.join(' AND ')} ORDER BY lower(nombre), id LIMIT $${params.length}`, params);
    const items = rows.slice(0, size).map(row => ({...row, precio_venta: num(row.precio_venta), ...(includeCost ? {precio_compra: num(row.precio_compra)} : {})}));
    const last = items.at(-1);
    return {items, next: rows.length > size ? {nombre: last.nombre, id: last.id} : null};
  }

  async getProduct(id) {
    const {rows} = await this.db.query('SELECT * FROM products WHERE company_id = $1 AND id = $2', [this.companyId, id]);
    return rows[0] ?? null;
  }

  // ------------------------------------------------------------ sales (BE-28)
  /** Sales newest first, by business day range, keyset pagination (fecha, id). */
  async listSales({from = null, to = null, limit = 100, before = null, userId = null} = {}) {
    const size = Math.min(Math.max(1, Number(limit) || 100), 500), params = [this.companyId], where = ['s.company_id = $1'];
    if (from) { params.push(validDay(from, 'Desde')); where.push(`s.fecha >= $${params.length}`); }
    if (to) { params.push(validDay(to, 'Hasta')); where.push(`s.fecha <= $${params.length}`); }
    if (userId) { params.push(userId); where.push(`s.user_id = $${params.length}`); }
    if (before) { params.push(before.fecha, before.id); where.push(`(s.fecha, s.id) < ($${params.length - 1}::date, $${params.length})`); }
    params.push(size + 1);
    const {rows} = await this.db.query(`SELECT s.id, s.fecha, s.usuario, s.user_id, s.cliente, s.placa, s.payment_method, s.total, s.anulada,
        coalesce(l.detalles, '[]'::json) AS detalles
      FROM sales s
      LEFT JOIN LATERAL (SELECT json_agg(json_build_object('producto_id', producto_id, 'nombre', nombre, 'cantidad', cantidad,
          'precio_unitario', precio_unitario, 'devuelto', devuelto) ORDER BY line_no) AS detalles
        FROM sale_lines WHERE company_id = s.company_id AND sale_id = s.id) l ON true
      WHERE ${where.join(' AND ')} ORDER BY s.fecha DESC, s.id DESC LIMIT $${params.length}`, params);
    const items = rows.slice(0, size).map(row => ({...row, total: num(row.total)})), last = items.at(-1);
    return {items, next: rows.length > size ? {fecha: last.fecha, id: last.id} : null};
  }

  async getSale(id) {
    const {rows} = await this.db.query('SELECT * FROM sales WHERE company_id = $1 AND id = $2', [this.companyId, id]);
    if (!rows[0]) return null;
    const [lines, labor, reversals] = await Promise.all([
      this.db.query('SELECT * FROM sale_lines WHERE company_id = $1 AND sale_id = $2 ORDER BY line_no', [this.companyId, id]),
      this.db.query('SELECT * FROM sale_labor WHERE company_id = $1 AND sale_id = $2 ORDER BY line_no', [this.companyId, id]),
      this.db.query(`SELECT * FROM reversals WHERE company_id = $1 AND doc_type = 'venta' AND doc_id = $2 ORDER BY seq`, [this.companyId, id]),
    ]);
    return {...rows[0], detalles: lines.rows, labor: labor.rows, reversiones: reversals.rows};
  }

  /**
   * Creates a sale in ONE transaction (BE-26, BE-27):
   *  1. idempotency (INSERT ... ON CONFLICT) when requestId is given;
   *  2. the business day must not have a cash closure;
   *  3. per product, in id order (no deadlocks):
   *     UPDATE products SET stock = stock - $1 WHERE id = $2 AND company_id = $3 AND stock >= $1
   *     Zero rows = insufficient stock (or product of another company) -> rollback;
   *  4. sale, lines (with the cost at sale time), labor, stock movements and audit.
   * Two checkouts competing for the last unit: the row lock serializes them and only one
   * satisfies `stock >= $1`. Sales of different products never block each other.
   */
  async createSale(input) {
    const companyId = this.companyId, at = iso(input.now), fecha = validDay(input.fecha, 'Fecha de venta');
    if (!METHODS.includes(input.paymentMethod)) fail('Selecciona efectivo, transferencia o tarjeta');
    const items = (input.items || []).map(item => {
      const cantidad = Number(item.cantidad);
      if (!Number.isSafeInteger(cantidad) || cantidad < 1) fail('Cantidad inválida');
      if (typeof item.producto_id !== 'string' || !item.producto_id) fail('Producto inexistente', 404, 'PRODUCT_NOT_FOUND');
      return {producto_id: item.producto_id, cantidad, precio_unitario: moneyAmount(item.precio_unitario, 'Precio unitario')};
    });
    const laborInput = (input.labor || []).map(line => ({mecanicoId: line.mecanicoId, descripcion: String(line.descripcion || '').trim(), importe: moneyAmount(line.importe, 'Mano de obra')}));
    if (!items.length && !laborInput.length) fail('Agrega productos o mano de obra');
    if (items.length > 1000 || laborInput.length > 100) fail('Lista de artículos o servicios inválida');
    const saleId = input.id || at.replace(/\D/g, '').slice(0, 17) + '-' + crypto.randomUUID().slice(0, 8);

    return this.db.transaction(async tx => {
      if (input.requestId) {
        const claim = await claimRequest(tx, {userId: input.userId, requestId: input.requestId, fingerprint: input.fingerprint ?? '', companyId, now: at});
        if (claim.status === 'replay') return {sale: claim.result?.saleId ? await new CompanyScope(tx, companyId).getSale(claim.result.saleId) : null, replayed: true};
      }
      const closed = await tx.query('SELECT 1 FROM cash_closures WHERE company_id = $1 AND date = $2', [companyId, fecha]);
      if (closed.rowCount) fail('La caja de esa fecha ya está cerrada; registra la venta con la fecha de hoy.', 409, 'CASH_ALREADY_CLOSED');

      const mechanics = new Map();
      if (laborInput.length) {
        const ids = [...new Set(laborInput.map(line => line.mecanicoId))];
        const {rows} = await tx.query('SELECT id, name, percentage FROM mechanics WHERE company_id = $1 AND id = ANY($2::text[]) AND active', [companyId, ids]);
        for (const row of rows) mechanics.set(row.id, row);
        for (const line of laborInput) {
          const mechanic = mechanics.get(line.mecanicoId);
          if (!mechanic) fail('El mecánico seleccionado no está activo o no pertenece a esta empresa.', 400, 'INVALID_MECHANIC');
          if (mechanic.percentage == null) fail('El administrador debe asignar el porcentaje de este mecánico.', 400, 'MECHANIC_PERCENTAGE_REQUIRED');
          if (!line.descripcion) fail('Trabajo realizado: dato obligatorio');
        }
      }

      const quantities = new Map();
      for (const item of items) quantities.set(item.producto_id, (quantities.get(item.producto_id) || 0) + item.cantidad);
      const products = new Map(), movements = [];
      for (const productId of [...quantities.keys()].sort()) {
        const qty = quantities.get(productId);
        const updated = await tx.query(`UPDATE products SET stock = stock - $1, updated_at = $4
          WHERE id = $2 AND company_id = $3 AND stock >= $1
          RETURNING nombre, stock, precio_compra`, [qty, productId, companyId, at]);
        if (!updated.rowCount) {
          const {rows} = await tx.query('SELECT nombre, stock FROM products WHERE company_id = $1 AND id = $2', [companyId, productId]);
          if (!rows[0]) fail('Producto inexistente', 404, 'PRODUCT_NOT_FOUND');
          fail(`Stock insuficiente para ${rows[0].nombre}: quedan ${rows[0].stock} unidades y solicitaste ${qty}`, 409, 'STOCK_INSUFFICIENT');
        }
        const product = updated.rows[0];
        products.set(productId, product);
        movements.push({company_id: companyId, id: `${saleId}-${productId}`, fecha: at, producto_id: productId, nombre: product.nombre, cantidad: -qty, tipo: 'venta',
          usuario: input.usuario ?? null, user_id: input.userId ?? null, stock_antes: product.stock + qty, stock_despues: product.stock, tipo_documento: 'venta', documento: saleId});
      }

      const lines = items.map((item, index) => ({line_no: index, ...item, nombre: products.get(item.producto_id).nombre, costo_unitario: num(products.get(item.producto_id).precio_compra)}));
      const labor = laborInput.map((line, index) => ({line_no: index, ...line, mecanico: mechanics.get(line.mecanicoId).name, mecanicoPorcentaje: num(mechanics.get(line.mecanicoId).percentage)}));
      const subtotalProductos = sumMoney(lines.map(line => roundMoney(line.cantidad * line.precio_unitario)));
      const subtotalManoObra = sumMoney(labor.map(line => line.importe)), total = sumMoney([subtotalProductos, subtotalManoObra]);
      await tx.query(`INSERT INTO sales(company_id, id, fecha, created_at, usuario, user_id, cliente, telefono, customer_id, placa, payment_method,
          subtotal_productos, subtotal_mano_obra, total, data_consent_at, data_consent_by, data_consent_medium)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [companyId, saleId, fecha, at, input.usuario ?? null, input.userId ?? null, input.cliente || 'Cliente general', input.telefono || '', input.customerId ?? null,
        input.placa || '', input.paymentMethod, subtotalProductos, subtotalManoObra, total, input.dataConsent ? at : null,
        input.dataConsent ? input.usuario ?? null : null, input.dataConsent ? input.dataConsent.medium || 'verbal' : null]);
      if (lines.length) await insertRows(tx, 'sale_lines', ['company_id', 'sale_id', 'line_no', 'producto_id', 'nombre', 'cantidad', 'precio_unitario', 'costo_unitario'],
        lines.map(line => [companyId, saleId, line.line_no, line.producto_id, line.nombre, line.cantidad, line.precio_unitario, line.costo_unitario]));
      if (labor.length) await insertRows(tx, 'sale_labor', ['company_id', 'sale_id', 'line_no', 'descripcion', 'mecanico_id', 'mecanico', 'mecanico_porcentaje', 'importe'],
        labor.map(line => [companyId, saleId, line.line_no, line.descripcion, line.mecanicoId, line.mecanico, line.mecanicoPorcentaje, line.importe]));
      if (movements.length) await insertRows(tx, 'stock_movements', ['company_id', 'id', 'fecha', 'producto_id', 'nombre', 'cantidad', 'tipo', 'usuario', 'user_id', 'stock_antes', 'stock_despues', 'tipo_documento', 'documento'],
        movements.map(m => [m.company_id, m.id, m.fecha, m.producto_id, m.nombre, m.cantidad, m.tipo, m.usuario, m.user_id, m.stock_antes, m.stock_despues, m.tipo_documento, m.documento]));
      await tx.query(`INSERT INTO audit_log(scope, company_id, id, fecha, usuario, user_id, accion, documento, motivo, despues)
        VALUES('business', $1, $2, $3, $4, $5, 'venta', $2, $6, $7)`,
      [companyId, saleId, at, input.usuario ?? null, input.userId ?? null, input.supportReason ?? '', JSON.stringify({total, placa: input.placa || '', cliente: input.cliente || 'Cliente general'})]);
      if (input.requestId) await tx.query('UPDATE idempotency_keys SET result = $3 WHERE user_id = $1 AND request_id = $2', [input.userId, input.requestId, JSON.stringify({saleId})]);
      return {sale: {id: saleId, fecha, total, subtotal_productos: subtotalProductos, subtotal_mano_obra: subtotalManoObra, payment_method: input.paymentMethod,
        detalles: lines, labor, stock: Object.fromEntries([...products].map(([id, p]) => [id, p.stock]))}, replayed: false};
    });
  }

  // ------------------------------------------------------------ reports in SQL (DM-06)
  /**
   * Sales by business day and payment method with the same rules as admin-reports.mjs
   * (salesReport): gross = sale total; returns = returned units x price + labor refund
   * (capped at gross); a full cancellation counts the whole gross as cancellation;
   * net = gross - returns - cancellations. Legacy delivered workshop services without a
   * sale count on their delivery day, like financial-sales.mjs.
   */
  async salesReport({from, to}) {
    validDay(from, 'Desde'); validDay(to, 'Hasta');
    if (from > to) fail('La fecha inicial no puede ser posterior a la final.');
    // Only returned lines (partial index sale_lines_returned_idx) and sales with a labor
    // refund need extra lookups; the rest is a single range scan of sales.
    const {rows} = await this.db.query(`WITH returned AS (
        SELECT l.sale_id, sum(least(l.devuelto, l.cantidad) * l.precio_unitario) AS amount
        FROM sale_lines l JOIN sales s ON s.company_id = l.company_id AND s.id = l.sale_id
        WHERE l.company_id = $1 AND l.devuelto > 0 AND s.fecha BETWEEN $2 AND $3
        GROUP BY l.sale_id
      ), docs AS (
        SELECT s.fecha, coalesce(s.payment_method, '') AS method, s.anulada, s.total,
          coalesce(r.amount, 0) + CASE WHEN coalesce(s.labor_refund, (s.extra->>'devolucion_mano_obra')::numeric, 0) > 0
            THEN least(coalesce((SELECT sum(importe) FROM sale_labor sl WHERE sl.company_id = s.company_id AND sl.sale_id = s.id), s.subtotal_mano_obra, 0),
                       coalesce(s.labor_refund, (s.extra->>'devolucion_mano_obra')::numeric))
            ELSE 0 END AS returned
        FROM sales s LEFT JOIN returned r ON r.sale_id = s.id
        WHERE s.company_id = $1 AND s.fecha BETWEEN $2 AND $3
        UNION ALL
        SELECT coalesce(v.fecha_entrega, v.fecha), coalesce(v.payment_method, ''), v.anulada, v.total, 0
        FROM services v
        WHERE v.company_id = $1 AND v.venta_id IS NULL AND coalesce(v.extra->>'saleId', '') = '' AND coalesce(v.extra->>'documento', '') = ''
          AND (v.estado = 'entregado' OR v.anulada AND v.estado_anterior = 'entregado')
          AND coalesce(v.fecha_entrega, v.fecha) BETWEEN $2 AND $3
      )
      SELECT fecha, method AS payment_method, count(*)::int AS count, sum(total)::text AS gross,
        sum(CASE WHEN anulada THEN 0 ELSE least(total, returned) END)::text AS returns,
        sum(CASE WHEN anulada THEN total ELSE 0 END)::text AS cancellations
      FROM docs GROUP BY fecha, method ORDER BY fecha, method`, [this.companyId, from, to]);
    const days = rows.map(row => {
      const gross = Number(row.gross), returns = Number(row.returns), cancellations = Number(row.cancellations);
      return {fecha: row.fecha, paymentMethod: row.payment_method, count: row.count, gross, returns, cancellations, net: roundMoney(gross - returns - cancellations)};
    });
    const paymentTotals = {efectivo: 0, transferencia: 0, tarjeta: 0};
    const totals = {count: 0, gross: 0, returns: 0, cancellations: 0, net: 0};
    for (const day of days) {
      if (METHODS.includes(day.paymentMethod)) paymentTotals[day.paymentMethod] = roundMoney(paymentTotals[day.paymentMethod] + day.net);
      for (const key of Object.keys(totals)) totals[key] = key === 'count' ? totals.count + day.count : roundMoney(totals[key] + day[key]);
    }
    return {from, to, days, paymentTotals, totals};
  }
}

async function insertRows(db, table, columns, rows) {
  const params = [], values = rows.map(row => '(' + row.map(value => { params.push(value); return '$' + params.length; }).join(',') + ')');
  await db.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')}`, params);
}
