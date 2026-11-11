const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const params = input => input instanceof URLSearchParams ? input : new URLSearchParams(input);
const day = value => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(value));

function page(rows, state, query) {
  const limit = Number(query.get('limit') || 50);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) fail('El tamaño de página debe estar entre 1 y 200');
  let offset = 0;
  if (query.get('cursor')) {
    let cursor;
    try { cursor = JSON.parse(Buffer.from(query.get('cursor'), 'base64url').toString()); }
    catch { fail('Página inválida; vuelve al inicio del listado'); }
    if (!cursor || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || !Number.isSafeInteger(cursor.revision)) fail('Página inválida');
    if (cursor.revision !== state.revision) fail('El listado cambió. Actualiza para consultar las existencias vigentes.', 409);
    offset = cursor.offset;
  }
  return {items: rows.slice(offset, offset + limit), total: rows.length, revision: state.revision,
    next_cursor: offset + limit < rows.length ? Buffer.from(JSON.stringify({offset: offset + limit, revision: state.revision})).toString('base64url') : null};
}

export function consultarProductos(state, input = {}) {
  const query = params(input), search = normalize(query.get('q'));
  const availability = query.get('disponibilidad') || 'todos';
  if (!['todos', 'agotado', 'bajo', 'disponible'].includes(availability)) fail('Filtro de disponibilidad inválido');
  const order = query.get('orden') || 'nombre', direction = query.get('direccion') || 'asc';
  if (!['nombre', 'stock', 'precio'].includes(order) || !['asc', 'desc'].includes(direction)) fail('Orden de productos inválido');
  const exact = p => search && [p.referencia, p.codigo_barras].some(value => normalize(value) === search);
  const terms = search.split(/\s+/).filter(Boolean);
  const rows = state.prods.filter(p => {
    const haystack = normalize([p.nombre, p.referencia, p.categoria, p.marca, p.modelo, p.compatibilidad, p.codigo_barras].join(' '));
    return terms.every(term => haystack.includes(term)) &&
      (!query.get('categoria') || normalize(p.categoria) === normalize(query.get('categoria'))) &&
      (!query.get('marca') || normalize(p.marca) === normalize(query.get('marca'))) &&
      (availability === 'todos' || availability === 'agotado' && p.stock === 0 || availability === 'bajo' && p.stock > 0 && p.stock <= p.stock_minimo || availability === 'disponible' && p.stock > 0);
  }).sort((a, b) => {
    if (exact(a) !== exact(b)) return exact(a) ? -1 : 1;
    const comparison = order === 'nombre' ? a.nombre.localeCompare(b.nombre, 'es', {sensitivity: 'base'}) : order === 'stock' ? a.stock - b.stock : a.precio_venta - b.precio_venta;
    return comparison * (direction === 'desc' ? -1 : 1) || String(a.id).localeCompare(String(b.id));
  });
  return page(rows, state, query);
}

export function consultarMovimientos(state, input = {}, productId) {
  const query = params(input);
  const from = query.get('desde'), to = query.get('hasta');
  for (const value of [from, to]) if (value) {
    const date = new Date(value + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('Usa fechas válidas con formato AAAA-MM-DD');
  }
  if (from && to && from > to) fail('La fecha inicial no puede ser posterior a la final');
  const pid = productId || query.get('producto_id');
  const rows = state.movimientos.filter(m => {
    const localDay = from || to ? day(m.fecha) : null;
    return (!pid || m.producto_id === pid) && (!from || localDay >= from) && (!to || localDay <= to) &&
      (!query.get('tipo') || normalize(m.tipo) === normalize(query.get('tipo'))) &&
      (!query.get('usuario') || normalize(m.usuario) === normalize(query.get('usuario')));
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return page(rows, state, query);
}
