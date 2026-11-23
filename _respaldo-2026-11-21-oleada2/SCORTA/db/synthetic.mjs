// DM-08 / QA-15: synthetic data at scale, written straight into Postgres with set-based
// SQL (generate_series), and a measurement of the main repository operations.
//
//   node db/synthetic.mjs --companies=3 --products=30000 --months=3 --sales-per-day=267 \
//        --measure --md=docs/datos/medicion.md
//
// Without SCORTA_DATABASE_URL it runs on PGlite (in memory, or --pglite-dir=<dir>).
// With SCORTA_DATABASE_URL it writes into that database: use an EMPTY staging database;
// the generator refuses to run when company ids it would create already exist.
import {writeFileSync} from 'node:fs';
import {cpus, totalmem} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDatabase} from './client.mjs';
import {migrateUp} from './migrate.mjs';
import {PostgresRepository} from './repository.mjs';

const KINDS = ['Filtro de aceite', 'Pastillas de freno', 'Kit de arrastre', 'Bujia', 'Llanta', 'Cadena', 'Rodamiento', 'Guaya de clutch', 'Bombillo', 'Espejo', 'Amortiguador', 'Bateria'];
const BRANDS = ['Honda', 'Yamaha', 'Suzuki', 'AKT', 'Bajaj', 'TVS', 'Kawasaki', 'Hero'];
const MODELS = ['CB110', 'XTZ125', 'GN125', 'NKD125', 'Pulsar 180', 'Apache 160', 'Boxer 100', 'FZ25', 'Splendor', 'Duke 200'];
const sqlArray = values => 'ARRAY[' + values.map(v => `'${v.replace(/'/g, "''")}'`).join(',') + ']';
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Generates companies × products × days of sales (1-3 lines per sale, ~2% cancelled,
 * ~3% of lines with a returned unit, one stock movement per line).
 * Returns the generated ids and counts.
 */
export async function generateSynthetic(db, {companies = 3, products = 30000, months = 3, salesPerDay = 267, endDate = '2026-11-20', prefix = 'syn', log = () => {}} = {}) {
  const days = months * 30, ids = Array.from({length: companies}, (_, i) => `${prefix}-c${String(i + 1).padStart(2, '0')}`);
  const existing = await db.query('SELECT id FROM companies WHERE id = ANY($1::text[])', [ids]);
  if (existing.rowCount) throw Error('Ya existen empresas sintéticas con esos ids; usa otro --prefix o una base vacía.');
  const counts = {companies, products: 0, sales: 0, sale_lines: 0, stock_movements: 0};
  for (const [index, companyId] of ids.entries()) {
    const started = Date.now();
    await db.transaction(async tx => {
      await tx.query(`INSERT INTO companies(id, name, slug, start_date, end_date, monthly_fee, created_at)
        VALUES($1, $2, $1, $3, $4, 150000, now())`, [companyId, `Sintética ${index + 1}`, addDays(endDate, -days - 1), addDays(endDate, 365)]);
      await tx.query(`INSERT INTO mechanics(company_id, id, name, percentage) VALUES($1, 'm1', 'Mecánico 1', 40)`, [companyId]);
      counts.products += (await tx.query(`INSERT INTO products(company_id, id, nombre, search_text, categoria, referencia, marca, modelo, compatibilidad,
          codigo_barras, precio_compra, precio_venta, stock, stock_minimo)
        SELECT $1, 'p' || g, x.nombre, lower(x.nombre || ' ' || x.ref || ' ' || x.marca || ' ' || x.modelo || ' ' || x.barcode),
          x.kind, x.ref, x.marca, x.modelo, x.modelo, x.barcode, x.price * 0.6, x.price, 1000000, 5
        FROM generate_series(1, $2::int) g,
        LATERAL (SELECT k.kind, b.marca, m.modelo, 'REF-' || lpad(g::text, 6, '0') AS ref, (770000000000 + g)::text AS barcode,
            k.kind || ' ' || b.marca || ' ' || m.modelo || ' #' || g AS nombre, (5000 + (g * 37 % 200) * 1000)::numeric AS price
          FROM (SELECT (${sqlArray(KINDS)})[1 + g % ${KINDS.length}] AS kind) k,
               (SELECT (${sqlArray(BRANDS)})[1 + (g / ${KINDS.length}) % ${BRANDS.length}] AS marca) b,
               (SELECT (${sqlArray(MODELS)})[1 + (g / 7) % ${MODELS.length}] AS modelo) m) x`, [companyId, products])).rowCount;
      counts.sales += (await tx.query(`INSERT INTO sales(company_id, id, fecha, created_at, usuario, user_id, cliente, payment_method, subtotal_productos, subtotal_mano_obra, total, anulada)
        SELECT $1, 's' || lpad(d::text, 4, '0') || '-' || lpad(k::text, 5, '0'), $2::date - d,
          (($2::date - d) + time '08:00') AT TIME ZONE 'America/Bogota' + k * interval '2 seconds',
          'vendedor', 'u-vendedor', 'Cliente general', (ARRAY['efectivo','transferencia','tarjeta'])[1 + k % 3], 0, 0, 0, k % 50 = 0
        FROM generate_series(0, $3::int - 1) d, generate_series(1, $4::int) k`, [companyId, endDate, days, salesPerDay])).rowCount;
      counts.sale_lines += (await tx.query(`INSERT INTO sale_lines(company_id, sale_id, line_no, producto_id, nombre, cantidad, precio_unitario, costo_unitario, devuelto)
        SELECT s.company_id, s.id, ln, p.id, p.nombre, q.cantidad, p.precio_venta, p.precio_compra,
          CASE WHEN NOT s.anulada AND (hashtext(s.id || ln || 'r') & 2147483647) % 33 = 0 THEN 1 ELSE 0 END
        FROM sales s
        CROSS JOIN LATERAL generate_series(0, (hashtext(s.id) & 2147483647) % 3) ln
        CROSS JOIN LATERAL (SELECT 1 + (hashtext(s.id || ln) & 2147483647) % 2 AS cantidad, 'p' || (1 + (hashtext(s.id || '-' || ln) & 2147483647) % $2::int) AS pid) q
        JOIN products p ON p.company_id = s.company_id AND p.id = q.pid
        WHERE s.company_id = $1`, [companyId, products])).rowCount;
      await tx.query(`UPDATE sales s SET subtotal_productos = x.t, total = x.t
        FROM (SELECT sale_id, sum(cantidad * precio_unitario) AS t FROM sale_lines WHERE company_id = $1 GROUP BY sale_id) x
        WHERE s.company_id = $1 AND s.id = x.sale_id`, [companyId]);
      await tx.query(`INSERT INTO reversals(company_id, doc_type, doc_id, seq, id, fecha, fecha_comercial, usuario, motivo, parcial, detalles)
        SELECT s.company_id, 'venta', s.id, 0, s.id || '-r', s.created_at + interval '1 hour', s.fecha, 'admin', 'Sintética', NOT s.anulada,
          coalesce((SELECT json_agg(json_build_object('index', line_no, 'cantidad', CASE WHEN s.anulada THEN cantidad - devuelto ELSE devuelto END))
                    FROM sale_lines l WHERE l.company_id = s.company_id AND l.sale_id = s.id AND (s.anulada OR devuelto > 0))::jsonb, '[]')
        FROM sales s WHERE s.company_id = $1 AND (s.anulada OR EXISTS (SELECT 1 FROM sale_lines l WHERE l.company_id = s.company_id AND l.sale_id = s.id AND l.devuelto > 0))`, [companyId]);
      counts.stock_movements += (await tx.query(`INSERT INTO stock_movements(company_id, id, fecha, producto_id, nombre, cantidad, tipo, usuario, user_id, tipo_documento, documento)
        SELECT l.company_id, l.sale_id || '-' || l.line_no, s.created_at, l.producto_id, l.nombre, -l.cantidad, 'venta', s.usuario, s.user_id, 'venta', l.sale_id
        FROM sale_lines l JOIN sales s ON s.company_id = l.company_id AND s.id = l.sale_id WHERE l.company_id = $1`, [companyId])).rowCount;
    });
    log(`empresa ${index + 1}/${companies} (${companyId}) en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  await db.exec('ANALYZE');
  return {ids, counts, endDate, days};
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)];
async function timeIt(samples, warmup, fn) {
  for (let i = 0; i < warmup; i++) await fn(i);
  const times = [];
  for (let i = 0; i < samples; i++) { const t = performance.now(); await fn(i); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);
  return {samples, p50: percentile(times, 50), p95: percentile(times, 95), max: times.at(-1)};
}

/** p50/p95 of search, create sale, list 100 sales and 30-day report. */
export async function measure(db, {ids, endDate, products, samples = 100, warmup = 5}) {
  const repo = new PostgresRepository(db), pick = i => repo.forCompany(ids[i % ids.length]);
  const terms = ['filtro', 'pastillas yamaha', 'kit arrastre akt', 'bujia', 'REF-001234', 'llanta honda cb110', 'amortiguador', 'cadena bajaj', 'guaya', 'espejo tvs'];
  const results = {};
  results.search = await timeIt(samples, warmup, i => pick(i).searchProducts({q: terms[i % terms.length], limit: 50}));
  results.createSale = await timeIt(samples, warmup, i => pick(i).createSale({fecha: endDate, now: Date.parse(endDate + 'T20:00:00Z') + i, usuario: 'medicion', userId: 'u-medicion',
    paymentMethod: ['efectivo', 'transferencia', 'tarjeta'][i % 3],
    items: Array.from({length: 1 + i % 3}, (_, n) => ({producto_id: 'p' + (1 + (i * 7919 + n * 104729) % products), cantidad: 1, precio_unitario: 10000})),
    requestId: `medicion-${i}-${crypto.randomUUID()}`, fingerprint: 'f'}));
  results.listSales = await timeIt(samples, warmup, i => pick(i).listSales({from: addDays(endDate, -29 - (i % 30)), to: addDays(endDate, -(i % 30)), limit: 100}));
  results.report30 = await timeIt(Math.max(10, Math.floor(samples / 2)), 2, i => pick(i).salesReport({from: addDays(endDate, -29), to: endDate}));
  return results;
}

const BASELINE = {createSale: [1026.8, 1537.9], search: [207.3, 245.2], report30: [321.7, 458.8], listSales: [207.3, 245.2]};
export function measurementMarkdown({engine, params, counts, seconds, results, sizeMb}) {
  const f = n => n.toFixed(1).replace('.', ',');
  const row = (label, key, baseLabel) => `| ${label} | ${results[key].samples} | ${f(results[key].p50)} | ${f(results[key].p95)} | ${f(results[key].max)} | ${baseLabel} | ${f(BASELINE[key][0])} / ${f(BASELINE[key][1])} |`;
  return `| Operación (repositorio Postgres) | Muestras | p50 (ms) | p95 (ms) | máx. (ms) | Equivalente en MEDICION-BASE | Base p50 / p95 (ms) |
|---|---:|---:|---:|---:|---|---:|
${row('Búsqueda de producto (50 resultados, texto)', 'search', 'GET /api/v2/data (catálogo completo)')}
${row('Crear venta (1-3 líneas, transacción completa)', 'createSale', 'sale.create')}
${row('Listar 100 ventas (rango de 30 días)', 'listSales', 'GET /api/v2/data (todas las ventas)')}
${row('Reporte de ventas de 30 días (SQL)', 'report30', 'GET /api/v2/reports (30 días)')}

Motor: ${engine}. Datos: ${params.companies} empresas × ${params.products.toLocaleString('es-CO')} productos × ${params.months} meses
(${params.salesPerDay} ventas por día y empresa) = ${counts.products.toLocaleString('es-CO')} productos, ${counts.sales.toLocaleString('es-CO')} ventas,
${counts.sale_lines.toLocaleString('es-CO')} líneas y ${counts.stock_movements.toLocaleString('es-CO')} movimientos${sizeMb ? `; base de ${f(sizeMb)} MB` : ''}. Generación: ${f(seconds)} s.`;
}

async function main(argv) {
  const arg = (name, fallback) => { const found = argv.find(a => a.startsWith(`--${name}=`)); return found ? found.slice(name.length + 3) : fallback; };
  const params = {companies: Number(arg('companies', 3)), products: Number(arg('products', 30000)), months: Number(arg('months', 3)),
    salesPerDay: Number(arg('sales-per-day', 267)), endDate: arg('end', '2026-11-20'), prefix: arg('prefix', 'syn')};
  const db = await openDatabase({dataDir: arg('pglite-dir')});
  try {
    await migrateUp(db);
    const started = Date.now(), generated = await generateSynthetic(db, {...params, log: console.log});
    const seconds = (Date.now() - started) / 1000;
    console.log('Generado', generated.counts, `en ${seconds.toFixed(1)} s`);
    if (!argv.includes('--measure')) return;
    const results = await measure(db, {ids: generated.ids, endDate: params.endDate, products: params.products, samples: Number(arg('samples', 100))});
    const size = Number((await db.query('SELECT pg_database_size(current_database()) AS n')).rows[0].n) / 1048576;
    const table = measurementMarkdown({engine: db.kind === 'pglite' ? 'PGlite 0.5.15 (Postgres 18 en WASM, un solo hilo, en memoria)' : 'Postgres (' + (await db.query('SHOW server_version')).rows[0].server_version + ')',
      params, counts: generated.counts, seconds, results, sizeMb: size});
    console.log(table);
    const md = arg('md');
    if (md) {
      const env = `Node ${process.version} · ${process.platform} · ${cpus()[0]?.model?.trim()} (${cpus().length} núcleos) · ${(totalmem() / 2 ** 30).toFixed(1)} GB RAM`;
      writeFileSync(resolve(md), `<!-- generado por db/synthetic.mjs el ${new Date().toISOString()} -->\n${env}\n\n${table}\n`);
      console.log('Escrito', md);
    }
  } finally { await db.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
