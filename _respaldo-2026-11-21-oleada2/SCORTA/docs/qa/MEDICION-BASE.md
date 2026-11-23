# Medición base SQLite / estado JSON (QA-10)

Generado por `node docs/qa/medir-base.mjs --md docs/qa/MEDICION-BASE.md` el 2026-11-21 13:05 UTC.

## Entorno

- Node v26.13.1 · win32 10.0.26300 · Intel(R) Core(TM) i5-9400T CPU @ 1.80GHz (6 núcleos) · 15.9 GB RAM
- Motor medido: `platformRequest` en memoria (sin E/S de SQLite). En producción se suma la
  lectura/parseo y la escritura del JSON completo en SQLite por cada POST (ver nota).

## Datos

- 5.000 productos (importación real con `business.change` / `importar`).
- 20.000 ventas: 1.000 creadas con `sale.create` real y 19.000 replicadas a partir de ellas (ids y fechas nuevos); 1-3 líneas por venta, 60 días, 3 medios de pago.
- Tamaño del estado JSON: **18.4 MB**.
- Tiempo de siembra: importar 3.3 s · ventas reales 160.2 s · réplica 0.2 s.

## Resultados

| Operación | Muestras | p50 (ms) | p95 (ms) | máx. (ms) |
|---|---:|---:|---:|---:|
| sale.create (POST /api/v2/action) | 200 | 1026.8 | 1537.9 | 2046.3 |
| GET /api/v2/data (carga y búsqueda de catálogo) | 50 | 207.3 | 245.2 | 359.9 |
| GET /api/v2/reports (ventas, 1 día) | 50 | 165.8 | 228.1 | 245.7 |
| GET /api/v2/reports (ventas, 30 días) | 50 | 321.7 | 458.8 | 541.1 |
| GET /api/v2/overview (resumen, 30 días) | 50 | 632.1 | 937.1 | 968.3 |

## Lectura

- Cada POST clona el estado completo (`structuredClone`), por eso el costo de `sale.create`
  crece con el número total de ventas de **todas** las empresas, no solo con la venta.
- `GET /api/v2/data` envía el negocio completo al navegador; la búsqueda ocurre en el cliente.
- Con SQLite real se añade: `JSON.parse` del estado por solicitud y `JSON.stringify` +
  `UPDATE` por cada escritura (≈ tamaño del estado). Repetir esta medición con el mismo
  script tras la migración a Postgres y comparar p50/p95.
