// BE-24: data repository interface the application will use, and its Postgres
// implementation. NOT wired into the app yet (see docs/datos/PLAN-CORTE.md).
//
// Tenant isolation (SEG-12): every business operation goes through
// `repo.forCompany(companyId)`, which refuses an empty id and binds company_id as $1 of
// every statement. Child tables reference (company_id, parent_id), so even a buggy
// statement cannot attach a row of company A to a document of company B.
import {moneyAmount, roundMoney, sumMoney} from '../money.mjs';
import {addDays, rowExpected, saleNet, CASH_ROW_KEYS} from '../caja-credito.mjs';
import {CREDIT_METHOD, FAVOR_METHOD, PAYMENT_KEYS, SALE_PAYMENT_KEYS, BASE_PAYMENT_KEYS, allocatePayments, normalizePayments, primaryMethod, saleVat} from '../sale-pricing.mjs';
import {normalizeSearch, TABLE_COLUMNS} from './import-json.mjs';

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
 * @property {(companyId:string, o?:{actor?:{id?:string,username?:string}, now?:Date|string, certificate?:boolean}) => Promise<{companyId:string,empresa:string,tables:object,total:number,certificate:object}>} purgeCompany   BE-09: borra TODO lo de la empresa, en una transacción
 *
 * @typedef {object} CompanyRepository                       (every method scoped to one company)
 * @property {(q:{q?:string,limit?:number,after?:{nombre:string,id:string},includeCost?:boolean}) => Promise<{items:object[],next:object|null}>} searchProducts
 * @property {(id:string) => Promise<object|null>} getProduct
 * @property {(q:{from?:string,to?:string,limit?:number,before?:{fecha:string,id:string},userId?:string}) => Promise<{items:object[],next:object|null}>} listSales
 * @property {(id:string) => Promise<object|null>} getSale
 * @property {(sale:object) => Promise<{sale:object,replayed:boolean}>} createSale
 * @property {(q:{from:string,to:string}) => Promise<object>} salesReport   ventas por día y por medio de pago (sale_payments)
 * @property {(q:{from:string,to?:string,date?:string}) => Promise<object>} cashReport   libro de caja por día y medio (igual que cashBook de caja-credito.mjs)
 */

// Medios de pago REALES de la app (sale-pricing.mjs): los cinco que mueven dinero, más crédito,
// anticipo de separado y saldo a favor, que no entran a la caja. La tabla payment_methods los repite.
const MONEY_METHODS = PAYMENT_KEYS;
const SALE_METHODS = [...PAYMENT_KEYS, CREDIT_METHOD, FAVOR_METHOD];
const METHOD_ERROR = 'Selecciona efectivo, transferencia, tarjeta, Nequi o Daviplata';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fail = (message, status = 400, code = 'INVALID_OPERATION') => { throw Object.assign(Error(message), {status, code}); };
const iso = value => new Date(value ?? Date.now()).toISOString();
const likeEscape = value => value.replace(/[\\%_]/g, char => '\\' + char);
const num = value => value == null ? null : Number(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
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

  // ------------------------------------------------------------ purga de empresa (BE-09)
  /**
   * Borrado definitivo de una empresa, en UNA transacción, y conteos por tabla para el certificado.
   * `DELETE FROM companies` solo no alcanza: audit_log (scope business y platform), security_events
   * y sessions no tienen FK a propósito (sobreviven a la empresa) y sus antes/despues/details traen
   * nombres, teléfonos y placas. Aquí se borra explícitamente por company_id, hojas primero (orden
   * inverso de TABLE_COLUMNS = orden inverso de las claves foráneas), y al final se comprueba que
   * ninguna tabla con company_id conserve una fila; si falta alguna tabla (una migración nueva que
   * no se agregó a TABLE_COLUMNS) la purga se niega ANTES de borrar nada.
   * Con `certificate: true` deja en audit_log (platform, company_id NULL) el certificado: nombre,
   * id, fechas y conteos, sin datos de clientes finales.
   */
  async purgeCompany(companyId, {actor = null, now, certificate = false} = {}) {
    if (typeof companyId !== 'string' || !companyId.trim()) fail('company_id obligatorio para purgar una empresa', 403, 'COMPANY_REQUIRED');
    const at = iso(now);
    return this.db.transaction(async tx => {
      const {rows: [company]} = await tx.query('SELECT id, name, exported_at FROM companies WHERE id = $1 FOR UPDATE', [companyId]);
      if (!company) fail('Empresa inexistente', 404, 'COMPANY_NOT_FOUND');
      const {rows: tagged} = await tx.query(`SELECT DISTINCT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = current_schema() AND c.column_name IN ('company_id', 'support_company_id')`);
      const missing = tagged.map(row => row.table_name).filter(name => !Object.hasOwn(TABLE_COLUMNS, name));
      if (missing.length) fail(`La purga no cubre la(s) tabla(s) ${missing.join(', ')}: agrégalas a TABLE_COLUMNS y a purgeCompany antes de borrar empresas.`, 500, 'PURGE_INCOMPLETE');
      const userIds = (await tx.query('SELECT id FROM users WHERE company_id = $1', [companyId])).rows.map(row => row.id);
      const tables = {};
      for (const [table, columns] of Object.entries(TABLE_COLUMNS).reverse()) {
        let result;
        if (table === 'platform_meta') continue;
        else if (table === 'companies') result = await tx.query('DELETE FROM companies WHERE id = $1', [companyId]);
        else if (table === 'sessions') result = await tx.query('DELETE FROM sessions WHERE user_id = ANY($2::text[]) OR support_company_id = $1', [companyId, userIds]);
        else if (table === 'login_throttle') result = await tx.query(`DELETE FROM login_throttle WHERE kind = 'password' AND key = ANY($1::text[])`, [userIds]);
        else if (table === 'idempotency_keys') result = await tx.query('DELETE FROM idempotency_keys WHERE company_id = $1 OR user_id = ANY($2::text[])', [companyId, userIds]);
        else if (columns.includes('company_id')) result = await tx.query(`DELETE FROM ${table} WHERE company_id = $1`, [companyId]);
        else continue;
        tables[table] = result.rowCount;
      }
      for (const table of tagged.map(row => row.table_name)) {
        if (table === 'sessions') continue;
        const left = (await tx.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'} = $1`, [companyId])).rows[0].n;
        if (left) fail(`La purga dejó ${left} fila(s) en ${table}.`, 500, 'PURGE_INCOMPLETE');
      }
      const left = (await tx.query('SELECT count(*)::int AS n FROM sessions WHERE support_company_id = $1 OR user_id = ANY($2::text[])', [companyId, userIds])).rows[0].n;
      if (left) fail(`La purga dejó ${left} sesión(es).`, 500, 'PURGE_INCOMPLETE');
      const total = Object.values(tables).reduce((sum, n) => sum + n, 0), result = {companyId, empresa: company.name, tables, total, certificate: null};
      if (certificate) {
        const cert = {empresa: company.name, companyId, exportadoEn: company.exported_at, borradoEn: at, borradoPor: actor?.username ?? null, conteos: tables};
        await tx.query(`INSERT INTO audit_log(scope, company_id, id, fecha, usuario, user_id, accion, documento, extra)
          VALUES('platform', NULL, $1, $2, $3, $4, 'company.purge', $5, $6)`, [crypto.randomUUID(), at, actor?.username ?? null, actor?.id ?? null, companyId, JSON.stringify({certificado: cert})]);
        result.certificate = cert;
      }
      return result;
    });
  }
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
        coalesce(l.detalles, '[]'::json) AS detalles, coalesce(p.payments, '[]'::json) AS payments
      FROM sales s
      LEFT JOIN LATERAL (SELECT json_agg(json_build_object('producto_id', producto_id, 'nombre', nombre, 'cantidad', cantidad,
          'precio_unitario', precio_unitario, 'devuelto', devuelto) ORDER BY line_no) AS detalles
        FROM sale_lines WHERE company_id = s.company_id AND sale_id = s.id) l ON true
      LEFT JOIN LATERAL (SELECT json_agg(json_build_object('method', method, 'amount', amount::float8) ORDER BY line_no) AS payments
        FROM sale_payment_lines WHERE company_id = s.company_id AND sale_id = s.id) p ON true
      WHERE ${where.join(' AND ')} ORDER BY s.fecha DESC, s.id DESC LIMIT $${params.length}`, params);
    const items = rows.slice(0, size).map(row => ({...row, total: num(row.total)})), last = items.at(-1);
    return {items, next: rows.length > size ? {fecha: last.fecha, id: last.id} : null};
  }

  async getSale(id) {
    const {rows} = await this.db.query('SELECT * FROM sales WHERE company_id = $1 AND id = $2', [this.companyId, id]);
    if (!rows[0]) return null;
    const [lines, labor, reversals, payments, credit, rates] = await Promise.all([
      this.db.query('SELECT * FROM sale_lines WHERE company_id = $1 AND sale_id = $2 ORDER BY line_no', [this.companyId, id]),
      this.db.query('SELECT * FROM sale_labor WHERE company_id = $1 AND sale_id = $2 ORDER BY line_no', [this.companyId, id]),
      this.db.query(`SELECT * FROM reversals WHERE company_id = $1 AND doc_type = 'venta' AND doc_id = $2 ORDER BY seq`, [this.companyId, id]),
      this.db.query('SELECT method, amount, derived FROM sale_payment_lines WHERE company_id = $1 AND sale_id = $2 ORDER BY line_no', [this.companyId, id]),
      this.db.query('SELECT monto, saldo, pagado, plazo_dias, vence FROM sale_credit WHERE company_id = $1 AND sale_id = $2', [this.companyId, id]),
      this.db.query('SELECT tarifa, base, iva, total FROM sale_vat_rates WHERE company_id = $1 AND sale_id = $2 ORDER BY line_no', [this.companyId, id]),
    ]);
    return {...rows[0], detalles: lines.rows, labor: labor.rows, reversiones: reversals.rows, payments: payments.rows, credito: credit.rows[0] ?? null, iva_tarifas: rates.rows};
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
    const split = input.payments != null;
    if (!split && !SALE_METHODS.includes(input.paymentMethod)) fail(METHOD_ERROR);
    const items = (input.items || []).map(item => {
      const cantidad = Number(item.cantidad);
      if (!Number.isSafeInteger(cantidad) || cantidad < 1) fail('Cantidad inválida');
      if (typeof item.producto_id !== 'string' || !item.producto_id) fail('Producto inexistente', 404, 'PRODUCT_NOT_FOUND');
      const optionalMoney = (value, label) => value == null ? null : moneyAmount(value, label);
      return {producto_id: item.producto_id, cantidad, precio_unitario: moneyAmount(item.precio_unitario, 'Precio unitario'), precio_lista: optionalMoney(item.precio_lista, 'Precio de lista'),
        precio_modificado: optionalMoney(item.precio_modificado, 'Precio modificado'), descuento: optionalMoney(item.descuento, 'Descuento'), tarifa_iva: item.tarifa_iva == null ? null : Number(item.tarifa_iva)};
    });
    const laborInput = (input.labor || []).map(line => ({mecanicoId: line.mecanicoId, descripcion: String(line.descripcion || '').trim(), importe: moneyAmount(line.importe, 'Mano de obra')}));
    if (!items.length && !laborInput.length) fail('Agrega productos o mano de obra');
    if (items.length > 1000 || laborInput.length > 100) fail('Lista de artículos o servicios inválida');
    const saleId = input.id || at.replace(/\D/g, '').slice(0, 17) + '-' + crypto.randomUUID().slice(0, 8);
    // Total y pagos se validan antes de abrir la transacción: no dependen de la base.
    const subtotalProductos = sumMoney(items.map(item => roundMoney(item.cantidad * item.precio_unitario)));
    const subtotalManoObra = sumMoney(laborInput.map(line => line.importe)), total = sumMoney([subtotalProductos, subtotalManoObra]);
    const payments = split ? normalizePayments(input.payments, total, {allow: [CREDIT_METHOD, FAVOR_METHOD]}) : [{method: input.paymentMethod, amount: total}];
    const amountOf = method => sumMoney(payments.filter(payment => payment.method === method).map(payment => payment.amount));
    const creditAmount = amountOf(CREDIT_METHOD), favorAmount = amountOf(FAVOR_METHOD), cashAmount = amountOf('efectivo');
    if ((creditAmount > 0 || favorAmount > 0) && !input.customerId) fail('Selecciona la ficha del cliente para vender a crédito o usar su saldo a favor.', 400, 'CUSTOMER_REQUIRED');
    let received = null;
    if (input.efectivoRecibido != null && cashAmount > 0) {
      received = moneyAmount(input.efectivoRecibido, 'Efectivo recibido');
      if (received < cashAmount) fail('El efectivo recibido es menor que el valor a pagar en efectivo.');
    }
    const descuentos = sumMoney(items.map(item => roundMoney(item.cantidad * (item.descuento ?? 0)))), descuentoTotal = input.descuentoTotal == null ? null : moneyAmount(input.descuentoTotal, 'Descuento al total');

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
          RETURNING nombre, stock, precio_compra, tarifa_iva`, [qty, productId, companyId, at]);
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

      // BE-16: crédito (cupo y plazo del cliente) y saldo a favor, con la fila del cliente bloqueada.
      let credit = null;
      if (creditAmount > 0 || favorAmount > 0) {
        const {rows: [customer]} = await tx.query('SELECT credit_limit, credit_days, saldo_a_favor FROM customers WHERE company_id = $1 AND id = $2 AND erased_at IS NULL FOR UPDATE', [companyId, input.customerId]);
        if (!customer) fail('Cliente inexistente.', 404, 'CUSTOMER_NOT_FOUND');
        if (favorAmount > 0) {
          const spent = await tx.query('UPDATE customers SET saldo_a_favor = saldo_a_favor - $3 WHERE company_id = $1 AND id = $2 AND saldo_a_favor >= $3', [companyId, input.customerId, favorAmount]);
          if (!spent.rowCount) fail(`El saldo a favor del cliente es ${num(customer.saldo_a_favor) ?? 0}.`, 400, 'FAVOR_INSUFFICIENT');
        }
        if (creditAmount > 0) {
          const {rows: [used]} = await tx.query(`SELECT coalesce(sum(c.saldo), 0)::text AS saldo FROM sale_credit c JOIN sales s ON s.company_id = c.company_id AND s.id = c.sale_id
            WHERE c.company_id = $1 AND s.customer_id = $2 AND NOT s.anulada`, [companyId, input.customerId]);
          const next = roundMoney(Number(used.saldo) + creditAmount);
          if (next > (num(customer.credit_limit) ?? 0) && !input.allowOverCreditLimit) fail(`La venta a crédito supera el cupo: cupo ${num(customer.credit_limit) ?? 0}, saldo actual ${Number(used.saldo)}, nuevo saldo ${next}.`, 403, 'CREDIT_LIMIT');
          const {rows: [settings]} = await tx.query(`SELECT settings #>> '{caja,creditDays}' AS days FROM companies WHERE id = $1`, [companyId]);
          const days = customer.credit_days ?? (Number(settings?.days) || 30);
          credit = {monto: creditAmount, saldo: creditAmount, pagado: 0, plazo_dias: days, vence: addDays(fecha, days)};
        }
      }

      const lines = items.map((item, index) => {
        const product = products.get(item.producto_id), rate = input.iva ? item.tarifa_iva ?? num(product.tarifa_iva) ?? input.iva.defaultRate ?? 19 : item.tarifa_iva;
        return {line_no: index, ...item, tarifa_iva: rate ?? null, nombre: product.nombre, costo_unitario: num(product.precio_compra)};
      });
      const labor = laborInput.map((line, index) => ({line_no: index, ...line, mecanico: mechanics.get(line.mecanicoId).name, mecanicoPorcentaje: num(mechanics.get(line.mecanicoId).percentage)}));
      // BE-18: IVA con los precios realmente cobrados (mismo cálculo que la app: saleVat).
      let iva = null;
      if (input.iva) {
        const ivaInfo = {incluido: true, preciosCatalogoConIva: input.iva.preciosCatalogoConIva !== false, tarifa_mano_obra: input.iva.tarifaManoObra ?? input.iva.defaultRate ?? 19};
        const vat = saleVat({iva: ivaInfo, detalles: lines, labor});
        iva = {...ivaInfo, total: vat.iva, rows: vat.rows};
      }
      const primary = primaryMethod(payments);
      await tx.query(`INSERT INTO sales(company_id, id, fecha, created_at, usuario, user_id, cliente, telefono, customer_id, placa, payment_method,
          subtotal_productos, subtotal_mano_obra, total, data_consent_at, data_consent_by, data_consent_medium, descuentos, descuento_total, efectivo_recibido, vueltas,
          iva_incluido, iva_precios_con_iva, iva_tarifa_mano_obra, iva_total)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
      [companyId, saleId, fecha, at, input.usuario ?? null, input.userId ?? null, input.cliente || 'Cliente general', input.telefono || '', input.customerId ?? null,
        input.placa || '', primary, subtotalProductos, subtotalManoObra, total, input.dataConsent ? at : null,
        input.dataConsent ? input.usuario ?? null : null, input.dataConsent ? input.dataConsent.medium || 'verbal' : null, descuentos > 0 ? descuentos : null, descuentoTotal,
        received, received == null ? null : roundMoney(received - cashAmount), iva ? iva.incluido : null, iva ? iva.preciosCatalogoConIva : null, iva ? iva.tarifa_mano_obra : null, iva ? iva.total : null]);
      await insertRows(tx, 'sale_payments', ['company_id', 'sale_id', 'line_no', 'method', 'amount'], payments.map((payment, index) => [companyId, saleId, index, payment.method, payment.amount]));
      if (credit) await insertRows(tx, 'sale_credit', ['company_id', 'sale_id', 'monto', 'saldo', 'pagado', 'plazo_dias', 'vence'], [[companyId, saleId, credit.monto, credit.saldo, credit.pagado, credit.plazo_dias, credit.vence]]);
      if (iva?.rows.length) await insertRows(tx, 'sale_vat_rates', ['company_id', 'sale_id', 'line_no', 'tarifa', 'base', 'iva', 'total'], iva.rows.map((row, index) => [companyId, saleId, index, row.tarifa, row.base, row.iva, row.total]));
      if (lines.length) await insertRows(tx, 'sale_lines', ['company_id', 'sale_id', 'line_no', 'producto_id', 'nombre', 'cantidad', 'precio_unitario', 'costo_unitario', 'precio_lista', 'precio_modificado', 'descuento', 'tarifa_iva'],
        lines.map(line => [companyId, saleId, line.line_no, line.producto_id, line.nombre, line.cantidad, line.precio_unitario, line.costo_unitario, line.precio_lista, line.precio_modificado, line.descuento, line.tarifa_iva]));
      if (labor.length) await insertRows(tx, 'sale_labor', ['company_id', 'sale_id', 'line_no', 'descripcion', 'mecanico_id', 'mecanico', 'mecanico_porcentaje', 'importe'],
        labor.map(line => [companyId, saleId, line.line_no, line.descripcion, line.mecanicoId, line.mecanico, line.mecanicoPorcentaje, line.importe]));
      if (movements.length) await insertRows(tx, 'stock_movements', ['company_id', 'id', 'fecha', 'producto_id', 'nombre', 'cantidad', 'tipo', 'usuario', 'user_id', 'stock_antes', 'stock_despues', 'tipo_documento', 'documento'],
        movements.map(m => [m.company_id, m.id, m.fecha, m.producto_id, m.nombre, m.cantidad, m.tipo, m.usuario, m.user_id, m.stock_antes, m.stock_despues, m.tipo_documento, m.documento]));
      await tx.query(`INSERT INTO audit_log(scope, company_id, id, fecha, usuario, user_id, accion, documento, motivo, despues)
        VALUES('business', $1, $2, $3, $4, $5, 'venta', $2, $6, $7)`,
      [companyId, saleId, at, input.usuario ?? null, input.userId ?? null, input.supportReason ?? '', JSON.stringify({total, placa: input.placa || '', cliente: input.cliente || 'Cliente general'})]);
      if (input.requestId) await tx.query('UPDATE idempotency_keys SET result = $3 WHERE user_id = $1 AND request_id = $2', [input.userId, input.requestId, JSON.stringify({saleId})]);
      return {sale: {id: saleId, fecha, total, subtotal_productos: subtotalProductos, subtotal_mano_obra: subtotalManoObra, payment_method: primary, payments,
        ...(credit ? {credito: credit} : {}), ...(iva ? {iva: {incluido: iva.incluido, tarifa_mano_obra: iva.tarifa_mano_obra, total: iva.total, tarifas: iva.rows}} : {}), descuentos,
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
   *
   * DM-12: the method comes from sale_payments (split payments, Nequi, Daviplata, credit...), not
   * from sales.payment_method. A sale paid with several methods is split among them in proportion to
   * what each paid, the main method (largest amount) absorbing the rounding: exactly allocatePayments()
   * of sale-pricing.mjs, so `paymentTotals` equals the app's report. `days` has one row per (day,
   * method): count = sales paid with that method, paid = what was charged with it, and gross / returns /
   * cancellations / net = its share. `totals` counts every sale ONCE (sale level).
   */
  async salesReport({from, to}) {
    validDay(from, 'Desde'); validDay(to, 'Hasta');
    if (from > to) fail('La fecha inicial no puede ser posterior a la final.');
    // Only returned lines (partial index sale_lines_returned_idx) and sales with a labor
    // refund need extra lookups; the rest is a single range scan of sales.
    const share = column => `CASE WHEN n_lines = 1 THEN ${column}
        WHEN is_main THEN ${column} - sum(CASE WHEN NOT is_main THEN coalesce(round(${column} * amount / NULLIF(paid, 0), 2), 0) ELSE 0 END) OVER (PARTITION BY doc_id)
        ELSE coalesce(round(${column} * amount / NULLIF(paid, 0), 2), 0) END`;
    const base = `WITH returned AS (
        SELECT l.sale_id, sum(least(l.devuelto, l.cantidad) * l.precio_unitario) AS amount
        FROM sale_lines l JOIN sales s ON s.company_id = l.company_id AND s.id = l.sale_id
        WHERE l.company_id = $1 AND l.devuelto > 0 AND s.fecha BETWEEN $2 AND $3
        GROUP BY l.sale_id
      ), docs AS (
        SELECT s.id AS doc_id, s.fecha, s.anulada, s.total,
          coalesce(r.amount, 0) + CASE WHEN coalesce(s.labor_refund, (s.extra->>'devolucion_mano_obra')::numeric, 0) > 0
            THEN least(coalesce((SELECT sum(importe) FROM sale_labor sl WHERE sl.company_id = s.company_id AND sl.sale_id = s.id), s.subtotal_mano_obra, 0),
                       coalesce(s.labor_refund, (s.extra->>'devolucion_mano_obra')::numeric))
            ELSE 0 END AS returned
        FROM sales s LEFT JOIN returned r ON r.sale_id = s.id
        WHERE s.company_id = $1 AND s.fecha BETWEEN $2 AND $3
        UNION ALL
        SELECT 'legacy-service:' || v.id, coalesce(v.fecha_entrega, v.fecha), v.anulada, v.total, 0
        FROM services v
        WHERE v.company_id = $1 AND v.venta_id IS NULL AND coalesce(v.extra->>'saleId', '') = '' AND coalesce(v.extra->>'documento', '') = ''
          AND (v.estado = 'entregado' OR v.anulada AND v.estado_anterior = 'entregado')
          AND coalesce(v.fecha_entrega, v.fecha) BETWEEN $2 AND $3
      ), priced AS (
        SELECT doc_id, fecha, total AS gross,
          CASE WHEN anulada THEN 0 ELSE least(total, returned) END AS returns,
          CASE WHEN anulada THEN total ELSE 0 END AS cancellations
        FROM docs
      ), net AS (
        SELECT *, greatest(0, gross - returns - cancellations) AS net FROM priced
      ), pay AS (
        SELECT p.sale_id AS doc_id, p.method, p.amount, p.line_no FROM sale_payment_lines p JOIN net n ON n.doc_id = p.sale_id WHERE p.company_id = $1
        UNION ALL
        SELECT 'legacy-service:' || v.id, v.payment_method, v.total, 0 FROM services v JOIN net n ON n.doc_id = 'legacy-service:' || v.id
          JOIN payment_methods m ON m.code = v.payment_method WHERE v.company_id = $1
      )`;
    const [byMethod, summary] = await Promise.all([
      this.db.query(`${base},
      alloc AS (
        SELECT n.doc_id, n.fecha, coalesce(p.method, '') AS method, coalesce(p.amount, 0) AS amount, n.gross, n.returns, n.cancellations, n.net,
          sum(coalesce(p.amount, 0)) OVER (PARTITION BY n.doc_id) AS paid, count(*) OVER (PARTITION BY n.doc_id) AS n_lines,
          coalesce(row_number() OVER (PARTITION BY n.doc_id ORDER BY p.amount DESC NULLS LAST, p.line_no) = 1, true) AS is_main
        FROM net n LEFT JOIN pay p ON p.doc_id = n.doc_id
      ), shares AS (
        SELECT doc_id, fecha, method, amount, ${share('gross')} AS gross, ${share('returns')} AS returns, ${share('cancellations')} AS cancellations, ${share('net')} AS net FROM alloc
      )
      SELECT fecha, method AS payment_method, count(DISTINCT doc_id)::int AS count, sum(amount)::text AS paid,
        sum(gross)::text AS gross, sum(returns)::text AS returns, sum(cancellations)::text AS cancellations, sum(net)::text AS net
      FROM shares GROUP BY fecha, method ORDER BY fecha, method`, [this.companyId, from, to]),
      this.db.query(`${base}
      SELECT count(*)::int AS count, coalesce(sum(gross), 0)::text AS gross, coalesce(sum(returns), 0)::text AS returns, coalesce(sum(cancellations), 0)::text AS cancellations,
        coalesce(sum(net), 0)::text AS net, (count(*) FILTER (WHERE net > 0 AND NOT EXISTS (SELECT 1 FROM pay p WHERE p.doc_id = net.doc_id)))::int AS unknown
      FROM net`, [this.companyId, from, to]),
    ]);
    const days = byMethod.rows.map(row => ({fecha: row.fecha, paymentMethod: row.payment_method, count: row.count, paid: Number(row.paid), gross: Number(row.gross), returns: Number(row.returns),
      cancellations: Number(row.cancellations), net: Number(row.net)}));
    const paymentTotals = Object.fromEntries(BASE_PAYMENT_KEYS.map(key => [key, 0]));
    for (const day of days) if (SALE_PAYMENT_KEYS.includes(day.paymentMethod)) paymentTotals[day.paymentMethod] = roundMoney((paymentTotals[day.paymentMethod] || 0) + day.net);
    const row = summary.rows[0];
    const totals = {count: row.count, gross: Number(row.gross), returns: Number(row.returns), cancellations: Number(row.cancellations), net: Number(row.net)};
    // BE-16: ventas a crédito del periodo (por la fecha de la venta), abonos recibidos y cartera actual.
    const credit = (await this.db.query(`SELECT
        (SELECT coalesce(sum(c.monto), 0) FROM sale_credit c JOIN sales s ON s.company_id = c.company_id AND s.id = c.sale_id
          WHERE c.company_id = $1 AND NOT s.anulada AND s.fecha BETWEEN $2 AND $3)::text AS sales,
        (SELECT coalesce(sum(amount), 0) FROM credit_payments WHERE company_id = $1 AND fecha BETWEEN $2 AND $3)::text AS payments,
        (SELECT coalesce(sum(c.saldo), 0) FROM sale_credit c JOIN sales s ON s.company_id = c.company_id AND s.id = c.sale_id
          WHERE c.company_id = $1 AND NOT s.anulada AND s.customer_id IS NOT NULL)::text AS portfolio`, [this.companyId, from, to])).rows[0];
    return {from, to, days, paymentTotals, totals, unknownPaymentCount: row.unknown, credit: {sales: Number(credit.sales), payments: Number(credit.payments), portfolio: Number(credit.portfolio)}};
  }

  /**
   * Cash book by day and payment method, in SQL, with the same rules as cashBook() of
   * caja-credito.mjs (the app's closing): expected = base + sales collected that day + credit
   * payments + layaway payments + deposits - expenses - withdrawals - refunds PAID that day.
   * Sales paid with credit, layaway advance or favor balance do not move money (they are listed
   * apart). Returns {from, to, days: {date: {rows, expected, creditSales, layawaySales, favorSales}}}.
   * Old sales returned or cancelled without a reversal record (and legacy workshop services) follow
   * the legacy rule (net value on their day, split among their methods): those few rows are read and
   * allocated with the app's own functions, so the book matches cashBook() for old data too.
   */
  async cashReport({from, to = from, date} = {}) {
    if (date) from = to = date;
    validDay(from, 'Desde'); validDay(to, 'Hasta');
    if (from > to) fail('La fecha inicial no puede ser posterior a la final.');
    const p = [this.companyId, from, to], q = async (sql, params = p) => (await this.db.query(sql, params)).rows;
    const money = `ANY(ARRAY[${MONEY_METHODS.map(method => `'${method}'`).join(',')}])`;
    // Venta antigua (regla anterior): sin registro de reversión y devuelta o anulada.
    const legacyRule = `NOT EXISTS (SELECT 1 FROM reversals r WHERE r.company_id = s.company_id AND r.doc_type = 'venta' AND r.doc_id = s.id)
      AND (s.anulada OR EXISTS (SELECT 1 FROM sale_lines l WHERE l.company_id = s.company_id AND l.sale_id = s.id AND l.devuelto > 0))`;
    const [sales, refunds, credits, layaways, cancels, movements, legacySales, legacyServices] = await Promise.all([
      q(`SELECT s.fecha::text AS day, x.method, sum(x.amount)::text AS amount FROM sales s JOIN sale_payment_lines x ON x.company_id = s.company_id AND x.sale_id = s.id
        WHERE s.company_id = $1 AND s.fecha BETWEEN $2 AND $3 AND NOT (${legacyRule}) GROUP BY 1, 2`),
      q(`SELECT coalesce(r.fecha_comercial, (r.fecha AT TIME ZONE 'America/Bogota')::date)::text AS day, f.method, sum(f.amount)::text AS amount
        FROM reversals r JOIN reversal_refunds f ON f.company_id = r.company_id AND f.doc_type = r.doc_type AND f.doc_id = r.doc_id AND f.seq = r.seq
        WHERE r.company_id = $1 AND r.doc_type = 'venta' AND coalesce(r.fecha_comercial, (r.fecha AT TIME ZONE 'America/Bogota')::date) BETWEEN $2 AND $3 GROUP BY 1, 2`),
      q(`SELECT fecha::text AS day, method, sum(amount)::text AS amount FROM credit_payments WHERE company_id = $1 AND fecha BETWEEN $2 AND $3 AND method = ${money} GROUP BY 1, 2`),
      q(`SELECT fecha::text AS day, method, sum(amount)::text AS amount FROM layaway_payments WHERE company_id = $1 AND fecha BETWEEN $2 AND $3 AND method = ${money} GROUP BY 1, 2`),
      q(`SELECT cancel_fecha::text AS day, cancel_method AS method, sum(cancel_reembolso)::text AS amount FROM layaways
        WHERE company_id = $1 AND cancel_fecha BETWEEN $2 AND $3 AND cancel_reembolso > 0 AND cancel_method = ${money} GROUP BY 1, 2`),
      q(`SELECT fecha::text AS day, method, tipo, sum(amount)::text AS amount FROM cash_movements WHERE company_id = $1 AND fecha BETWEEN $2 AND $3 GROUP BY 1, 2, 3`),
      q(`SELECT s.id, s.fecha::text AS day, s.anulada, s.total, s.payment_method, coalesce(s.labor_refund, (s.extra->>'devolucion_mano_obra')::numeric, 0) AS labor_refund,
          coalesce((SELECT json_agg(json_build_object('cantidad', l.cantidad, 'devuelto', l.devuelto, 'precio_unitario', l.precio_unitario) ORDER BY l.line_no)
            FROM sale_lines l WHERE l.company_id = s.company_id AND l.sale_id = s.id), '[]'::json) AS detalles,
          coalesce((SELECT json_agg(json_build_object('method', x.method, 'amount', x.amount::float8) ORDER BY x.line_no) FROM sale_payment_lines x WHERE x.company_id = s.company_id AND x.sale_id = s.id), '[]'::json) AS payments
        FROM sales s WHERE s.company_id = $1 AND s.fecha BETWEEN $2 AND $3 AND ${legacyRule}`),
      q(`SELECT v.id, coalesce(v.fecha_entrega, v.fecha)::text AS day, v.anulada, v.total, v.payment_method, v.extra,
          coalesce((SELECT json_agg(json_build_object('cantidad', l.cantidad, 'devuelto', l.devuelto, 'precio_unitario', l.precio_unitario) ORDER BY l.line_no)
            FROM service_lines l WHERE l.company_id = v.company_id AND l.service_id = v.id), '[]'::json) AS detalles
        FROM services v WHERE v.company_id = $1 AND v.venta_id IS NULL AND coalesce(v.extra->>'saleId', '') = '' AND coalesce(v.extra->>'documento', '') = ''
          AND (v.estado = 'entregado' OR v.anulada AND v.estado_anterior = 'entregado') AND coalesce(v.fecha_entrega, v.fecha) BETWEEN $2 AND $3`),
    ]);
    const book = {};
    const day = date => book[date] ??= {rows: {}, creditSales: 0, layawaySales: 0, favorSales: 0};
    const add = (date, method, key, value) => {
      const number = roundMoney(Number(value));
      if (!MONEY_METHODS.includes(method) || !number) return;
      const rows = day(date).rows, row = rows[method] ??= Object.fromEntries(CASH_ROW_KEYS.map(name => [name, 0]));
      row[key] = roundMoney(row[key] + number);
    };
    for (const row of sales) {
      if (row.method === CREDIT_METHOD) day(row.day).creditSales = roundMoney(day(row.day).creditSales + Number(row.amount));
      else if (row.method === 'anticipo') day(row.day).layawaySales = roundMoney(day(row.day).layawaySales + Number(row.amount));
      else if (row.method === FAVOR_METHOD) day(row.day).favorSales = roundMoney(day(row.day).favorSales + Number(row.amount));
      else add(row.day, row.method, 'ventas', row.amount);
    }
    for (const row of refunds) add(row.day, row.method, 'devoluciones', row.amount);
    for (const row of credits) add(row.day, row.method, 'abonos', row.amount);
    for (const row of layaways) add(row.day, row.method, 'separados', row.amount);
    for (const row of cancels) add(row.day, row.method, 'devoluciones', row.amount);
    for (const row of movements) add(row.day, row.method || 'efectivo', {base: 'base', gasto: 'gastos', retiro: 'retiros', ingreso: 'ingresos', pago_proveedor: 'gastos'}[row.tipo], row.amount);
    // Regla antigua: valor vigente de la venta en su día, repartido entre sus medios.
    const legacy = (row, sale) => {
      for (const [method, value] of Object.entries(allocatePayments(sale, saleNet(sale)))) add(row.day, method, 'ventas', value);
    };
    for (const row of legacySales) legacy(row, {anulada: row.anulada, total: num(row.total), laborRefund: num(row.labor_refund), detalles: row.detalles, payments: row.payments, paymentMethod: row.payment_method});
    for (const row of legacyServices) {
      const extra = object(row.extra);
      legacy(row, {anulada: row.anulada, total: num(row.total), laborRefund: extra.laborRefund ?? extra.devolucion_mano_obra, detalles: row.detalles, payments: extra.payments, paymentMethod: row.payment_method || extra.medio_pago});
    }
    const days = {};
    for (const [date, entry] of Object.entries(book)) {
      const keys = PAYMENT_KEYS.filter(key => BASE_PAYMENT_KEYS.includes(key) || Object.hasOwn(entry.rows, key));
      const rows = Object.fromEntries(keys.map(key => [key, entry.rows[key] ?? Object.fromEntries(CASH_ROW_KEYS.map(name => [name, 0]))]));
      days[date] = {date, rows, expected: Object.fromEntries(keys.map(key => [key, rowExpected(rows[key])])), creditSales: entry.creditSales, layawaySales: entry.layawaySales, favorSales: entry.favorSales};
    }
    return {from, to, days};
  }
}

async function insertRows(db, table, columns, rows) {
  const params = [], values = rows.map(row => '(' + row.map(value => { params.push(value); return '$' + params.length; }).join(',') + ')');
  await db.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')}`, params);
}
