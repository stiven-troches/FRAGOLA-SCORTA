# Plan de corte a Postgres

Estado al 2026-11-21: **preparación terminada**. Ya existen el esquema (`db/migrations/001_inicial.sql`), el
migrador (`db/migrate.mjs`), el importador y el verificador (`db/import-json.mjs`, `db/verify.mjs`),
el repositorio (`db/repository.mjs`) y el generador sintético (`db/synthetic.mjs`), con pruebas en PGlite
y en el job `postgres:16` del CI. **Nada de esto está conectado a la app.**

Esfuerzo en días de un desarrollador con pruebas (d). Total estimado: **≈ 24-30 d**.

## Paso 1. Interruptor `SCORTA_DB=sqlite|postgres` (BE-25) · 2 d

- `platform-server.mjs` gana un segundo adaptador, `openPostgresStore(url)`, con la misma interfaz que
  `openPlatformStore`: `request`, `stats`, `health`, `snapshot` y `close`. `server.mjs` elige el
  adaptador según `SCORTA_DB`; por defecto, `sqlite`.
- Al arrancar en modo `postgres`: `migrateUp`. Si falta la URL, se detiene con un error claro.
- Pool `pg` (OPS-16): `max` según el plan de Render. En el plan básico hay 97 conexiones; usar
  10-20 por instancia, con `statement_timeout` de 15 s y `idle_in_transaction_session_timeout` de 30 s.
- Volver atrás = cambiar la variable y reiniciar, mientras SQLite siga recibiendo los datos (paso 7).

## Paso 2. Adaptar `platformRequest` por partes (BE-24, BE-26) · 10-12 d

El motor puro recibe hoy el estado completo. Se adapta por familias de acciones, de menor a mayor
riesgo. Cada familia lee y escribe solo sus tablas y en una sola transacción. Durante la transición,
las acciones que todavía no se hayan migrado siguen usando el estado JSON reconstruido por empresa
(cargador `loadBusiness(companyId)`).

| Orden | Función / acción | Lee | Escribe (en este orden) |
|---|---|---|---|
| 1 | login, logout, `resolveActor`, contraseña (BE-31) | users, companies, sessions, login_throttle | login_throttle → sessions → users(last_login_at) → companies(last_login_at) → security_events |
| 2 | Idempotencia (`requests`) | idempotency_keys | `INSERT ... ON CONFLICT` **dentro** de la transacción de cada acción |
| 3 | `sale.create` (BE-27) | mechanics, customers, cash_closures, products | idempotency_keys → customers (upsert) → products (UPDATE condicional, en orden de id) → sales → sale_lines → sale_labor → services (si hay mano de obra) → stock_movements → receipts → audit_log → sale_drafts |
| 4 | `sale.reverse`, `sale.receipt*` | sales, sale_lines, cash_closures | sale_lines(devuelto) → products(stock + n) → reversals → services → stock_movements → receipts → audit_log |
| 5 | `business.change`: producto, ajuste, importar, eliminar | products, product_cost_history | products → product_cost_history → stock_movements → audit_log |
| 6 | `business.change`: compra y su reversión (BE-23) | products, product_cost_history, purchases | purchases → purchase_lines → products (stock y costo) → product_cost_history (repetición en orden) → reversals → stock_movements → audit_log |
| 7 | `mechanic.*`, `cash.close` | mechanics; reporte SQL del día | mechanics / cash_closures (UNIQUE company_id, date) → audit_log |
| 8 | `ticket.*`, `customer.update/erase`, `terms.accept` | support_tickets, customers, sales, services | ticket_messages, customers, sales/services (anonimización), receipts, audit_log, terms_acceptances |
| 9 | Plataforma: `company.*`, `user.*`, `sessions.revoke`, `twofa.*`, `support.*`, renovaciones | companies, users, sessions, payments | companies → users → payments → sessions → audit_log(platform) → security_events |
| 10 | `company.export` / `purge`, `exportCompany` | todas las tablas de una empresa | purge = `DELETE FROM companies` (cascada) + certificado en audit_log |

Reglas:

- **Revisión por empresa**: hoy cada escritura incrementa `business.revision`, y eso crea
  conflictos falsos entre cajas. Para las ventas desaparece: el stock lo protege el `UPDATE`
  condicional. Se conserva solo para la edición de productos y empresa (BE-13), con un
  `version` por fila (`UPDATE ... WHERE version = $n`).
- Las pruebas actuales (`node --test`) se ejecutan contra los dos adaptadores. Se parametriza
  `tests/qa-fixture.mjs` con `SCORTA_DB` y la suite completa debe pasar en ambos.

## Paso 3. API paginada y de búsqueda (BE-28, DM-05, DM-06) · 4 d

- `GET /api/v2/products?q=&after=&limit=50` → `searchProducts`; el costo solo se envía a administradores.
- `GET /api/v2/sales?from=&to=&before=&limit=100` → `listSales`; los vendedores ven solo las suyas (`userId`).
- `GET /api/v2/reports` y `/overview` → SQL. Ya existe la consulta de ventas por día y medio de pago;
  faltan el reporte de mecánicos y el resumen.
- `GET /api/v2/data` deja de enviar `prods`, `ventas`, `movimientos` y `auditoria` completos; queda la
  sesión, la configuración y los contadores. El frontend (`src/`) cambia la lista de inventario y el
  historial a carga por páginas.

## Paso 4. Sincronización incremental (BE-29) · 3 d

- Columna `updated_at` en las tablas visibles y un cursor por empresa:
  `GET /api/v2/changes?since=<cursor>` devuelve los productos, ventas y tickets cambiados desde entonces.
- Una secuencia global (`change_seq bigserial`) evita que los relojes de varias instancias
  desordenen el cursor.
- El navegador reemplaza el sondeo de 15 s con el estado completo por este delta.

## Paso 5. Ensayo en staging (DM-09, QA-15, QA-16) · 3 d (2 ensayos)

1. Crear Postgres de Render staging con PITR (OPS-15).
2. `node db/migrate.mjs up`.
3. Copia real **anonimizada** de `platform.sqlite`:
   `node db/import-json.mjs platform.sqlite --verify`. Hay que medir la duración, que fija la ventana.
4. Criterio de aprobación (QA-16): `db/verify.mjs` con **0 diferencias**.
5. Carga sintética a escala de meta:
   `node db/synthetic.mjs --companies=30 --products=30000 --months=12 --sales-per-day=800 --measure`,
   más una prueba de carga concurrente sobre la API (varias cajas por empresa).
6. Correr la suite completa con `SCORTA_DB=postgres` y los guiones piloto.

## Paso 6. Ventana de producción (DM-10) · 1 d

Ventana nocturna (por ejemplo, 23:00-01:00, hora de Bogotá), avisada con 48 horas.

1. Modo mantenimiento: la app responde 503 a los POST; se esperan los cierres de caja del día.
2. Respaldo: `snapshot()` de `platform.sqlite` y copia fuera de Render (OPS offsite).
3. `node db/import-json.mjs platform.sqlite --verify`. Si hay alguna diferencia, **se aborta** y se
   vuelve a SQLite.
4. Cambiar `SCORTA_DB=postgres` y reiniciar. Smoke test (`npm run smoke`): login, venta, devolución,
   reporte y cierre en una empresa de prueba.
5. Quitar el modo mantenimiento. Vigilar errores y latencia durante 2 horas.

## Paso 7. Plan de reversa · incluido

- **Durante la ventana**: si falla la verificación o el smoke test, se vuelve a `SCORTA_DB=sqlite`. El
  archivo SQLite no se tocó.
- **Después de abrir (primeros 7 días)**: exportador inverso `db/export-json.mjs` (pendiente,
  2 d), que reconstruye el JSON desde Postgres; `db/verify.mjs` en sentido contrario valida que no se
  pierde nada. Así se puede volver a SQLite sin perder las ventas hechas en Postgres.
- La base Postgres de la ventana fallida no se borra: queda para diagnóstico. Nunca se ejecuta
  `migrate down` con datos; la migración 001 se niega por diseño.
- Tras 30 días estables: retirar el adaptador SQLite y el interruptor.

## Pendientes que este plan no cubre

- BE-30: logos y fotos fuera de la base (hoy, `companies.logo` y `products.foto` como data URL).
- RLS como segunda capa (ver MODELO.md, §2), en la migración 002, cuando exista el rol `scorta_app`.
- DM-11: particionado (plan en MODELO.md, §6), cuando `sales` o `stock_movements` superen ~10 M filas.
- Bajar el tope de `moneyAmount` a `< 1e12` (límite de `NUMERIC(14,2)`).
