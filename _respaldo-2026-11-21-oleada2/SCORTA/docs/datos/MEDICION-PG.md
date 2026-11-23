# Medición en Postgres con datos sintéticos (DM-08 / QA-15)

Generado con:

```
node db/synthetic.mjs --companies=3 --products=30000 --months=3 --sales-per-day=267 --measure --samples=200
```

Fecha: 2026-11-21. El volumen pedido (3 empresas × 30.000 productos × 3 meses ≈ 72.000 ventas) **se
ejecutó completo en PGlite, sin reducirlo**.

## Entorno

- Node v26.13.1 · win32 · Intel Core i5-9400T a 1,80 GHz (6 núcleos) · 15,9 GB RAM. Es el mismo
  equipo de `docs/qa/MEDICION-BASE.md`.
- Motor: **PGlite 0.5.15** (Postgres 18 compilado a WASM, un solo hilo, en memoria, dentro del mismo
  proceso de Node). No hay red ni pool de conexiones.
- Repositorio medido: `db/repository.mjs` (`PostgresRepository`), con las mismas consultas que usará la app.

## Datos

| Concepto | Cantidad |
|---|---:|
| Empresas | 3 |
| Productos | 90.000 (30.000 por empresa) |
| Ventas | 72.090 (267 por día y empresa, 90 días; ~2 % anuladas) |
| Líneas de venta | 144.435 (1-3 por venta; ~3 % con una unidad devuelta) |
| Movimientos de stock | 144.435 |
| Tamaño de la base | 162,5 MB |
| Tiempo de generación (SQL con `generate_series`) | 51,3 s |

## Resultados

| Operación (repositorio Postgres) | Muestras | p50 (ms) | p95 (ms) | máx. (ms) | Equivalente en MEDICION-BASE | Base p50 / p95 (ms) | Mejora p50 |
|---|---:|---:|---:|---:|---|---:|---:|
| Búsqueda de producto (50 resultados, texto) | 200 | 17,6 | 58,7 | 102,6 | `GET /api/v2/data` (catálogo completo; búsqueda en el navegador) | 207,3 / 245,2 | ×12 |
| **Crear venta** (1-3 líneas, transacción completa) | 200 | **6,2** | **25,0** | 88,5 | `sale.create` | **1026,8 / 1537,9** | **×166** |
| Listar 100 ventas (rango de 30 días, con líneas) | 200 | 6,2 | 18,1 | 47,4 | `GET /api/v2/data` (todas las ventas) | 207,3 / 245,2 | ×33 |
| Reporte de ventas de 30 días (SQL, por día y medio de pago) | 100 | 36,1 | 68,8 | 88,6 | `GET /api/v2/reports` (30 días) | 321,7 / 458,8 | ×9 |

La base de comparación tenía **menos datos**: 5.000 productos y 20.000 ventas de una sola empresa,
frente a 90.000 productos y 72.000 ventas de tres empresas aquí.

## Lectura

- **Crear venta pasa de ~1 s a ~6 ms**, y ya no depende del tamaño total de la plataforma. Cada
  venta toca solo sus filas (stock de sus productos, la venta, sus líneas, sus movimientos y una fila de
  auditoría). Sigue estable al crecer el número de empresas.
- **Búsqueda (DM-05)**: p95 de 58,7 ms con 30.000 referencias por empresa, por debajo de la meta de
  100 ms. Usa el índice trigram de `search_text`. Las búsquedas de una palabra muy común (por ejemplo,
  «filtro», que coincide con 1 de cada 12 productos) son las más lentas, porque ordenan más
  coincidencias antes de paginar.
- **Reporte de 30 días**: en la primera versión, la consulta recorría las líneas de cada venta y
  tardaba 178 ms (p50). Con el índice parcial `sale_lines_returned_idx` (solo líneas devueltas) y la
  mano de obra consultada únicamente si hubo reembolso, bajó a unos 36 ms (p50). Su resultado coincide con
  `admin-reports.mjs` (probado en `tests/pg-repository.test.mjs`).
- **La transferencia de datos se reduce**: hoy `GET /api/v2/data` envía el negocio completo (18,4 MB
  en la medición base). Con la API paginada (BE-28), el navegador recibe páginas de 50 productos o 100
  ventas.

## Límites de esta medición

- PGlite tiene **un solo hilo y una sola conexión**: las transacciones se ejecutan en serie. Mide la
  latencia de cada operación, no la concurrencia. La carga concurrente real (30 empresas, varias
  cajas) debe medirse en Postgres de Render staging con el mismo script y `SCORTA_DATABASE_URL`
  (QA-15, DM-09).
- En Render se suma la latencia de red entre la app y la base (≈ 1-2 ms por consulta dentro de la
  misma región). Crear una venta hace unas 6-8 consultas, así que se esperan **≈ 15-25 ms p50**,
  todavía unas 40 veces mejor que hoy.
- La escala completa de la meta (30 empresas × 30.000 referencias × 12 meses ≈ 8,8 M ventas, unos
  2-3 GB) no se ejecutó en PGlite porque el volumen supera lo razonable para memoria WASM. Se debe
  correr en staging:
  `SCORTA_DATABASE_URL=... node db/synthetic.mjs --companies=30 --products=30000 --months=12 --sales-per-day=800 --measure`.
