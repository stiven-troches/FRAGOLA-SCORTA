// DM-12: especificación declarativa de las colecciones del negocio que tienen tabla propia
// (migración 002). Una sola descripción alimenta el importador (JSON -> filas, import-json.mjs)
// y el exportador inverso (filas -> JSON, export-json.mjs), así lo que entra es lo que sale.
//
// Cada campo es [ruta JSON, columna, tipo, valor por defecto?].
//   - Ruta con punto («anulacion.fecha»): campo de un objeto anidado («grupo»).
//   - Tipos: text, ts (timestamptz), day (date, día comercial Bogotá), num (numeric), int, bool, json.
//   - Lo que no tenga campo va a `extra` (en el grupo, a extra[grupo]); los días que hubo que
//     convertir (marca de tiempo -> día de Bogotá, '' -> NULL) guardan el valor original en
//     extra.__original[ruta] y el exportador lo restituye. Nada se pierde.

const BOGOTA = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'});
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isoOrNull = value => {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
/** Día comercial: un YYYY-MM-DD queda igual; una marca de tiempo pasa a su día de Bogotá. */
export const businessDay = value => {
  if (typeof value === 'string' && DAY.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? BOGOTA.format(date) : null;
};
export const json = value => value === undefined || value === null ? null : JSON.stringify(value);

const getPath = (object, path) => path.split('.').reduce((value, key) => value == null ? undefined : value[key], object);
const setPath = (object, path, value) => {
  const keys = path.split('.');
  let target = object;
  for (const key of keys.slice(0, -1)) target = target[key] ??= {};
  target[keys.at(-1)] = value;
};
const groupsOf = spec => [...new Set(spec.fields.filter(([path]) => path.includes('.')).map(([path]) => path.split('.')[0]))];
const topKeys = (spec, arrays = []) => new Set([...spec.fields.map(([path]) => path.split('.')[0]), ...arrays]);
const unknown = (object, known) => {
  const extra = {};
  for (const [key, value] of Object.entries(object || {})) if (!known.has(key) && value !== undefined) extra[key] = value;
  return extra;
};

/** Campos de la especificación: {row, original, groups}. `groups` = extras de objetos anidados. */
export function mapFields(spec, object) {
  const row = {}, original = {}, groups = {};
  for (const [path, column, kind, dflt] of spec.fields) {
    const raw = getPath(object, path), plain = raw === undefined ? null : raw;
    let value = plain;
    if (kind === 'ts') value = isoOrNull(value);
    else if (kind === 'day') {
      if (value === '') value = null;
      else if (value != null) value = businessDay(value);
      if (value !== plain) original[path] = plain;
    } else if (kind === 'bool') value = value == null ? null : value === true;
    else if (kind === 'json') value = json(value);
    if (value === null && dflt !== undefined) value = dflt;
    row[column] = value;
  }
  for (const group of groupsOf(spec)) {
    const known = new Set(spec.fields.filter(([path]) => path.startsWith(group + '.')).map(([path]) => path.split('.')[1]));
    const sub = object?.[group];
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      const rest = unknown(sub, new Set([...known, ...(spec.groupKnown?.[group] || [])]));
      if (Object.keys(rest).length) groups[group] = rest;
    }
  }
  return {row, original: Object.fromEntries(Object.entries(original).filter(([, value]) => value !== null)), groups};
}

/** Objeto del JSON -> fila (sin las claves de contexto, que agrega quien llama). */
export function mapRecord(spec, object, context = {}) {
  const {row, original, groups} = mapFields(spec, object);
  const extra = {...unknown(object, topKeys(spec, spec.arrays || [])), ...groups};
  if (Object.keys(original).length) extra.__original = original;
  return {...context, ...row, extra: Object.keys(extra).length ? JSON.stringify(extra) : null};
}

/** Fila -> campos del JSON. Con `spread`, las claves de extra que no son de grupo se copian al objeto. */
export function unmapFields(spec, row, extra = {}, {spread = false} = {}) {
  const object = {}, original = extra.__original || {}, groups = groupsOf(spec);
  for (const [path, column, kind] of spec.fields) {
    if (Object.hasOwn(original, path)) { setPath(object, path, original[path]); continue; }
    let value = row[column];
    if (value == null) continue;
    if (kind === 'num') value = Number(value);
    setPath(object, path, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (key === '__original') continue;
    if (groups.includes(key)) object[key] = {...(object[key] || {}), ...value};
    else if (spread) object[key] = value;
  }
  return object;
}

/** Fila -> objeto del JSON (inverso de mapRecord; las columnas NULL no producen clave). */
export const unmapRecord = (spec, row) => unmapFields(spec, row, row.extra && typeof row.extra === 'object' ? row.extra : {}, {spread: true});

// ----------------------------------------------------------------------------- especificaciones
const consent = prefix => [[`${prefix}.consentAt`, 'data_consent_at', 'ts'], [`${prefix}.consentBy`, 'data_consent_by', 'text'], [`${prefix}.consentMedium`, 'data_consent_medium', 'text']];
const iva = [['iva.incluido', 'iva_incluido', 'bool'], ['iva.preciosCatalogoConIva', 'iva_precios_con_iva', 'bool'], ['iva.tarifa_mano_obra', 'iva_tarifa_mano_obra', 'num'], ['iva.total', 'iva_total', 'num']];
const history = {fields: [['estado', 'estado', 'text', ''], ['fecha', 'fecha', 'ts'], ['usuario', 'usuario', 'text'], ['userId', 'user_id', 'text'], ['nota', 'nota', 'text']]};

export const SPECS = {
  suppliers: {fields: [['id', 'id', 'text'], ['nombre', 'nombre', 'text', ''], ['nit', 'nit', 'text', ''], ['contacto', 'contacto', 'text', ''], ['telefono', 'telefono', 'text', ''],
    ['correo', 'correo', 'text', ''], ['direccion', 'direccion', 'text', ''], ['notas', 'notas', 'text', ''], ['plazoDias', 'plazo_dias', 'int', 0], ['activo', 'activo', 'bool', true],
    ['createdAt', 'created_at', 'ts'], ['updatedAt', 'updated_at', 'ts'], ['usuario', 'usuario', 'text']]},
  purchase_orders: {arrays: ['items', 'recepciones', 'historial'], fields: [['id', 'id', 'text'], ['numero', 'numero', 'text', ''], ['fecha', 'fecha', 'day'], ['createdAt', 'created_at', 'ts'],
    ['supplierId', 'supplier_id', 'text'], ['proveedor', 'proveedor', 'text', ''], ['estado', 'estado', 'text'], ['total', 'total', 'num', 0], ['nota', 'nota', 'text', ''],
    ['fechaEntrega', 'fecha_entrega', 'day'], ['origen', 'origen', 'text'], ['enviadaEn', 'enviada_en', 'day'], ['cerradaEn', 'cerrada_en', 'day'],
    ['anulacion.fecha', 'anulacion_fecha', 'day'], ['anulacion.motivo', 'anulacion_motivo', 'text'], ['anulacion.usuario', 'anulacion_usuario', 'text'],
    ['usuario', 'usuario', 'text'], ['userId', 'user_id', 'text']]},
  purchase_order_lines: {fields: [['producto_id', 'producto_id', 'text', ''], ['nombre', 'nombre', 'text', ''], ['referencia', 'referencia', 'text'], ['cantidad', 'cantidad', 'int'],
    ['costo', 'costo', 'num'], ['recibido', 'recibido', 'int', 0]]},
  purchase_order_receipts: {fields: [['id', 'id', 'text', ''], ['fecha', 'fecha', 'day'], ['createdAt', 'created_at', 'ts'], ['compraId', 'compra_id', 'text'], ['total', 'total', 'num'],
    ['usuario', 'usuario', 'text'], ['credito', 'credito', 'bool'], ['anulada', 'anulada', 'bool'], ['items', 'items', 'json', '[]']]},
  purchase_order_history: history,
  cash_movements: {fields: [['id', 'id', 'text'], ['tipo', 'tipo', 'text'], ['fecha', 'fecha', 'day'], ['createdAt', 'created_at', 'ts'], ['method', 'method', 'text', 'efectivo'], ['amount', 'amount', 'num', 0],
    ['motivo', 'motivo', 'text', ''], ['categoria', 'categoria', 'text'], ['pagoProveedorId', 'pago_proveedor_id', 'text'], ['usuario', 'usuario', 'text'], ['userId', 'user_id', 'text']]},
  supplier_payments: {arrays: ['aplicado'], fields: [['id', 'id', 'text'], ['numero', 'numero', 'text', ''], ['fecha', 'fecha', 'day'], ['createdAt', 'created_at', 'ts'], ['supplierId', 'supplier_id', 'text'],
    ['proveedor', 'proveedor', 'text'], ['method', 'method', 'text'], ['amount', 'amount', 'num'], ['saldoAntes', 'saldo_antes', 'num'], ['saldoDespues', 'saldo_despues', 'num'],
    ['nota', 'nota', 'text', ''], ['cashMovementId', 'cash_movement_id', 'text'], ['usuario', 'usuario', 'text'], ['userId', 'user_id', 'text']]},
  supplier_payment_applications: {fields: [['compraId', 'compra_id', 'text'], ['fecha', 'fecha', 'day'], ['factura', 'factura', 'text'], ['amount', 'amount', 'num', 0],
    ['saldoAntes', 'saldo_antes', 'num'], ['saldoDespues', 'saldo_despues', 'num']]},
  credit_payments: {arrays: ['aplicado'], fields: [['id', 'id', 'text'], ['numero', 'numero', 'text', ''], ['fecha', 'fecha', 'day'], ['createdAt', 'created_at', 'ts'], ['customerId', 'customer_id', 'text'],
    ['cliente', 'cliente', 'text'], ['telefono', 'telefono', 'text'], ['method', 'method', 'text'], ['amount', 'amount', 'num'], ['saldoAntes', 'saldo_antes', 'num'],
    ['saldoDespues', 'saldo_despues', 'num'], ['nota', 'nota', 'text', ''], ['usuario', 'usuario', 'text'], ['userId', 'user_id', 'text']]},
  credit_payment_applications: {fields: [['saleId', 'sale_id', 'text'], ['fecha', 'fecha', 'day'], ['amount', 'amount', 'num', 0], ['saldoAntes', 'saldo_antes', 'num'], ['saldoDespues', 'saldo_despues', 'num']]},
  layaways: {arrays: ['detalles', 'abonos'], fields: [['id', 'id', 'text'], ['numero', 'numero', 'text', ''], ['fecha', 'fecha', 'day'], ['createdAt', 'created_at', 'ts'], ['vence', 'vence', 'day'],
    ['dias', 'dias', 'int'], ['customerId', 'customer_id', 'text'], ['cliente', 'cliente', 'text', ''], ['telefono', 'telefono', 'text', ''], ['tipoCliente', 'tipo_cliente', 'text'],
    ['total', 'total', 'num', 0], ['pagado', 'pagado', 'num', 0], ['saldo', 'saldo', 'num', 0], ['estado', 'estado', 'text'], ['nota', 'nota', 'text', ''], ['usuario', 'usuario', 'text'], ['userId', 'user_id', 'text'],
    ...iva.slice(0, 3), ...consent('dataConsent'), ['entregadoEn', 'entregado_en', 'ts'], ['fechaEntrega', 'fecha_entrega', 'day'], ['saleId', 'sale_id', 'text'], ['entregadoPor', 'entregado_por', 'text'],
    ['cancelacion.fecha', 'cancel_fecha', 'day'], ['cancelacion.createdAt', 'cancel_created_at', 'ts'], ['cancelacion.motivo', 'cancel_motivo', 'text'], ['cancelacion.destino', 'cancel_destino', 'text'],
    ['cancelacion.usuario', 'cancel_usuario', 'text'], ['cancelacion.userId', 'cancel_user_id', 'text'], ['cancelacion.method', 'cancel_method', 'text'],
    ['cancelacion.reembolso', 'cancel_reembolso', 'num'], ['cancelacion.saldoAFavor', 'cancel_saldo_a_favor', 'num']]},
  layaway_lines: {fields: [['producto_id', 'producto_id', 'text', ''], ['nombre', 'nombre', 'text', ''], ['cantidad', 'cantidad', 'int'], ['precio_unitario', 'precio_unitario', 'num', 0],
    ['precio_lista', 'precio_lista', 'num'], ['costo_unitario', 'costo_unitario', 'num'], ['tarifa_iva', 'tarifa_iva', 'num']]},
  layaway_payments: {fields: [['id', 'id', 'text', ''], ['numero', 'numero', 'text'], ['fecha', 'fecha', 'day'], ['createdAt', 'created_at', 'ts'], ['method', 'method', 'text'], ['amount', 'amount', 'num'],
    ['saldoAntes', 'saldo_antes', 'num'], ['saldoDespues', 'saldo_despues', 'num'], ['usuario', 'usuario', 'text'], ['userId', 'user_id', 'text']]},
  quotes: {arrays: ['detalles'], fields: [['id', 'id', 'text'], ['numero', 'numero', 'text', ''], ['fecha', 'fecha', 'day'], ['createdAt', 'created_at', 'ts'], ['dias', 'dias', 'int'], ['vence', 'vence', 'day'],
    ['estado', 'estado', 'text'], ['customerId', 'customer_id', 'text'], ['cliente', 'cliente', 'text', ''], ['telefono', 'telefono', 'text', ''], ['tipoCliente', 'tipo_cliente', 'text'],
    ['tipoDocumento', 'tipo_documento', 'text'], ['numeroDocumento', 'numero_documento', 'text'], ...consent('dataConsent'),
    ['descuentoVenta.tipo', 'desc_venta_tipo', 'text'], ['descuentoVenta.valor', 'desc_venta_valor', 'num'], ['bruto', 'bruto', 'num'], ['descuentos', 'descuentos', 'num'], ['total', 'total', 'num', 0],
    ['nota', 'nota', 'text', ''], ['usuario', 'usuario', 'text'], ['userId', 'user_id', 'text'], ...iva, ['iva.tarifas', 'iva_tarifas', 'json'],
    ['anulacion.fecha', 'anulacion_fecha', 'day'], ['anulacion.createdAt', 'anulacion_created_at', 'ts'], ['anulacion.motivo', 'anulacion_motivo', 'text'], ['anulacion.usuario', 'anulacion_usuario', 'text'],
    ['anulacion.userId', 'anulacion_user_id', 'text'], ['saleId', 'sale_id', 'text'], ['convertidaEn', 'convertida_en', 'ts'], ['convertidaPor', 'convertida_por', 'text'],
    ['cambiosAceptados', 'cambios_aceptados', 'json']]},
  quote_lines: {fields: [['producto_id', 'producto_id', 'text', ''], ['nombre', 'nombre', 'text', ''], ['referencia', 'referencia', 'text'], ['cantidad', 'cantidad', 'int'], ['precio_lista', 'precio_lista', 'num'],
    ['precio_modificado', 'precio_modificado', 'num'], ['descuentoLinea.tipo', 'desc_linea_tipo', 'text'], ['descuentoLinea.valor', 'desc_linea_valor', 'num'], ['descuento', 'descuento', 'num'],
    ['precio_unitario', 'precio_unitario', 'num', 0], ['tarifa_iva', 'tarifa_iva', 'num']]},
  warranties: {arrays: ['historial'], fields: [['id', 'id', 'text'], ['numero', 'numero', 'text', ''], ['fecha', 'fecha', 'day'], ['createdAt', 'created_at', 'ts'], ['saleId', 'sale_id', 'text'],
    ['saleFecha', 'sale_fecha', 'day'], ['lineIndex', 'line_index', 'int'], ['producto_id', 'producto_id', 'text', ''], ['nombre', 'nombre', 'text', ''], ['cantidad', 'cantidad', 'int'],
    ['precio_unitario', 'precio_unitario', 'num'], ['cliente', 'cliente', 'text', ''], ['telefono', 'telefono', 'text', ''], ['customerId', 'customer_id', 'text'], ['motivo', 'motivo', 'text', ''],
    ['supplierId', 'supplier_id', 'text'], ['proveedor', 'proveedor', 'text', ''], ['garantiaDias', 'garantia_dias', 'int'], ['venceGarantia', 'vence_garantia', 'day'],
    ['fueraDePlazo', 'fuera_de_plazo', 'bool', false], ['estado', 'estado', 'text'], ['enGarantia', 'en_garantia', 'int'], ['resultado', 'resultado', 'text'], ['decision', 'decision', 'json'],
    ['respuestaProveedor', 'respuesta_proveedor', 'json'], ['nota', 'nota', 'text', ''], ['usuario', 'usuario', 'text'], ['userId', 'user_id', 'text']]},
  warranty_history: history,
};

// IVA de una venta: las columnas viven en `sales`; las filas por tarifa en sale_vat_rates (import-json.mjs).
export const SALE_IVA = {fields: iva};

// Campos nuevos de la venta con columna propia (descuentos, vueltas, documento del cliente, enlaces).
export const SALE_NEW = {fields: [['descuentos', 'descuentos', 'num'], ['descuento_total', 'descuento_total', 'num'], ['efectivo_recibido', 'efectivo_recibido', 'num'], ['vueltas', 'vueltas', 'num'],
  ['tipoDocumento', 'tipo_documento', 'text'], ['numeroDocumento', 'numero_documento', 'text'], ['tipoCliente', 'tipo_cliente', 'text'], ['cotizacionId', 'cotizacion_id', 'text'],
  ['cotizacionNumero', 'cotizacion_numero', 'text'], ['separadoId', 'separado_id', 'text'], ['separadoNumero', 'separado_numero', 'text']]};
