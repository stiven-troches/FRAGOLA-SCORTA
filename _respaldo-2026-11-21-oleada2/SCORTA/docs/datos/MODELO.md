# Modelo de datos en Postgres (DM-02)

Estado: **preparado, sin conectar a la app**. Esquema: `db/migrations/001_inicial.sql` (y su `.down.sql`).
Importación: `db/import-json.mjs`. Verificación: `db/verify.mjs`. Repositorio: `db/repository.mjs`.

## 1. Decisión

Hoy toda la plataforma es **un documento JSON** (tabla `platform`, fila 1). Cada escritura clona,
serializa y reescribe el documento completo, y todas las escrituras pasan por una cola global.
Con 5.000 productos y 20.000 ventas, `sale.create` tarda alrededor de 1 s (p50); la meta es de 30
empresas × 30.000 referencias × 800 ventas al día.

Decidimos un **modelo relacional normalizado en Postgres** (Render), con estas reglas:

| Regla | Decisión | Motivo |
|---|---|---|
| Multiempresa | `company_id text NOT NULL` en toda tabla de negocio; la PK empieza por `company_id` | Índices por empresa; aislamiento (SEG-12) |
| Hijas | FK compuesta `(company_id, padre_id)` → `padre(company_id, id)` | La base impide que una línea de A cuelgue de un documento de B |
| IDs | `text`, se conservan los actuales | Sin traducción de ids; enlaces, comprobantes e idempotencia siguen válidos |
| Dinero | `NUMERIC(14,2)` | Exacto; igual al redondeo de `money.mjs` |
| Cantidades | `bigint` | `num()` admite enteros hasta 1e12 |
| Momento del evento | `timestamptz` | Auditoría, movimientos, sesiones |
| Día comercial | `date` en America/Bogota | Ventas, compras, cierres y reportes se cuentan por día de Bogotá |
| Lo que no tiene columna | `extra jsonb` en cada tabla | **Nada se pierde**; campos futuros o heredados viajan intactos |
| Stock | `CHECK (stock >= 0)` + `UPDATE ... AND stock >= $1` | BE-27: sin conflictos falsos entre cajas ni stock negativo |

`stock_movements.fecha_comercial` es una columna generada: `(fecha AT TIME ZONE 'America/Bogota')::date`.

### Límite de importes

`NUMERIC(14,2)` admite hasta 999.999.999.999,99. `moneyAmount()` acepta hasta 1e12 inclusive, así
que un importe de exactamente 1.000.000.000.000 no cabe. En la práctica no ocurre: COP 1e12 equivale a
unos USD 250 millones. Si llegara a ocurrir, la importación falla completa, no trunca el valor. En la
fase de corte, `moneyAmount` debe bajar su tope a `< 1e12`.

### Búsqueda de productos (DM-05)

PGlite 0.5.15 incluye `pg_trgm`, verificado en local; Render Postgres también lo permite. Por eso
usamos **`pg_trgm`**:

- `products.search_text`: texto normalizado (minúsculas, sin tildes) de nombre, referencia, marca,
  modelo, compatibilidad, código de barras y categoría. Lo calcula la aplicación con la misma
  `norm()` de `platform.mjs` (`productSearchText` en `db/import-json.mjs`). Así se evita depender de
  `unaccent`, que no es `IMMUTABLE` y no sirve en un índice.
- Índice `GIN (search_text gin_trgm_ops)`. Cada palabra buscada se traduce en un `search_text LIKE '%palabra%'`,
  con los comodines escapados. Este filtro usa el índice.
- Índices B-tree aparte para la coincidencia exacta de referencia (`lower(referencia)`) y de código de
  barras, y `(company_id, lower(nombre), id)` para ordenar y paginar con keyset.

Si en algún entorno no existiera `pg_trgm`, el plan B es un índice por expresión
`(company_id, lower(nombre) text_pattern_ops)` para búsquedas por prefijo. No hace falta hoy.

### Vehículos

En el JSON no existe una entidad de vehículo: `aggregates()` la calcula desde las ventas (placa,
visitas, cliente). Por eso **no hay tabla `vehicles`**. Se creó la vista `vehicle_visits` (empresa,
placa, visitas, última visita, clientes). La tabla propia queda para cuando el producto defina datos
del vehículo (marca, modelo, kilometraje).

### Productos en líneas y movimientos: sin FK

`sale_lines`, `purchase_lines`, `service_lines` y `stock_movements` guardan `producto_id` y una
**instantánea** de nombre y costo. No llevan FK a `products` porque el retiro de un producto
(`kind: 'eliminar'`) conserva su movimiento de apertura en cero, y los datos heredados pueden traer
productos retirados. La integridad la garantiza el repositorio: el `UPDATE` condicional exige que el
producto exista en la misma empresa. `db/verify.mjs` compara el stock producto por producto.

## 2. Aislamiento entre empresas (SEG-12): decisión

**Decidido: `company_id` obligatorio en el repositorio, reforzado por claves foráneas compuestas.
RLS queda como segunda capa para una migración posterior (002), no en 001.**

Cómo se garantiza hoy:

1. `repo.forCompany(companyId)` rechaza un id vacío (`COMPANY_REQUIRED`). Todas las consultas de
   negocio llevan `company_id = $1`, y la empresa se fija al construir el objeto, no en cada llamada.
2. Las PK empiezan por `company_id` y las hijas usan FK compuestas. Aunque una consulta tenga un error,
   la base rechaza una línea, un comprobante, un historial de costo o un servicio que cruce empresas.
   Esto se prueba en `tests/pg-aislamiento.test.mjs`.
3. El mismo id de producto en dos empresas es válido y no se confunde: el `UPDATE` de stock filtra por
   `(id, company_id)`.

Por qué no RLS ahora:

- En Render, la aplicación se conecta con el usuario dueño de las tablas. RLS no se aplica al dueño
  salvo con `FORCE ROW LEVEL SECURITY`, y nunca se aplica a un superusuario. En CI (`postgres:16`) y
  en PGlite, el usuario es superusuario, así que **las pruebas pasarían sin que RLS actuara**. Sería
  una protección que no podemos verificar en CI.
- RLS con `current_setting('app.company_id')` obliga a abrir una transacción con `SET LOCAL` en cada
  lectura (una ida y vuelta más) y es frágil con un pool en modo transacción (PgBouncer).
- Las operaciones de plataforma (propietario, login por empresa, importación, métricas) cruzan
  empresas y necesitarían un rol o un modo de exención, lo que agrega otra superficie de error.

Plan para RLS (fase posterior a la conexión): crear el rol `scorta_app` sin `BYPASSRLS` y que no sea
dueño de las tablas, con `ENABLE` + `FORCE ROW LEVEL SECURITY` y la política
`USING (company_id = current_setting('app.company_id', true))` en las tablas de negocio. El repositorio
de empresa ejecutaría `set_config('app.company_id', $1, true)` al iniciar cada transacción; la
plataforma usaría otro rol. La prueba cruzada se repetiría con `SET ROLE scorta_app`.

## 3. Tablas

| Tabla | PK | Contenido | Índices principales |
|---|---|---|---|
| `platform_meta` | id=1 | Raíz de la plataforma | — |
| `companies` | id | Empresas, contrato, revisión del negocio | `slug` único, `lower(name)` |
| `terms_acceptances` | (company_id, version, accepted_at) | Aceptación de términos (BE-07) | — |
| `users` | id | Usuarios; propietario con `company_id` NULL | único `(company_id, lower(username))` |
| `sessions` | token_hash | Sesiones (BE-31) | user_id, expires_at, support_company_id |
| `login_throttle` | (kind, key) | Límites de login, origen, cuenta y contraseña | until |
| `idempotency_keys` | (user_id, request_id) | `state.requests` | created_at |
| `payments` | id | Mensualidades | (company_id, date) |
| `security_events` | id | Eventos de seguridad | fecha, (company_id, fecha) |
| `audit_log` | seq | Auditoría global (`platform`) y por empresa (`business`) | (company_id, fecha), (scope, fecha) |
| `support_tickets` / `ticket_messages` | (company_id, id) / (company_id, ticket_id, seq) | Soporte | (company_id, status, updated_at) |
| `sale_drafts` | (company_id, user_id, support) | Borradores de venta | — |
| `mechanics` | (company_id, id) | Mecánicos con porcentaje | — |
| `customers` | (company_id, id) | Clientes, consentimiento y borrado | (company_id, telefono) |
| `products` | (company_id, id) | Catálogo y stock | GIN trigram, nombre, referencia, código, stock bajo |
| `product_cost_history` | (company_id, product_id, seq) | `costHistory` con cantidades | (company_id, document_id) |
| `purchases` / `purchase_lines` | (company_id, id) / (+ line_no) | Compras | (company_id, fecha, id) |
| `sales` / `sale_lines` / `sale_labor` | (company_id, id) / (+ line_no) | Ventas | (company_id, fecha, id), usuario, cliente, placa; líneas devueltas |
| `services` / `service_lines` | (company_id, id) / (+ line_no) | Órdenes de taller | (company_id, fecha), venta_id, estado |
| `reversals` | (company_id, doc_type, doc_id, seq) | Devoluciones y anulaciones | (company_id, fecha_comercial) |
| `stock_movements` | (company_id, id) | Kardex | (company_id, fecha), (company_id, producto_id, fecha) |
| `cash_closures` | (company_id, id), único (company_id, date) | Cierres con snapshot | — |
| `receipts` | token_hash | Enlaces de comprobante (solo el hash) | (company_id, sale_id), expires_at |
| vista `vehicle_visits` | — | Vehículos derivados de las ventas | — |

`audit_log`, `security_events` y `sessions` no tienen FK a `companies` a propósito: el certificado
de borrado (BE-09) y los eventos de seguridad deben sobrevivir a la empresa. Las demás tablas
borran en cascada desde `companies`, igual que hoy `removeCompany`.

## 4. Mapeo campo por campo del JSON

Notación: `x[]` es un arreglo y `{k}` un mapa por clave. Toda tabla tiene `extra jsonb`: cualquier
campo no listado se guarda allí con su nombre original (prueba: `tests/pg-import.test.mjs`, «nada se
pierde»). Las fechas `YYYY-MM-DD` heredadas que vinieran como marca de tiempo se convierten a su día
de Bogotá, y el valor original queda en `extra.__original`.

### Raíz de la plataforma

| JSON | Tabla.columna |
|---|---|
| `schemaVersion` | `platform_meta.schema_version` |
| `revision` | `platform_meta.revision` |
| `ownerCompany` / `ownerContact` | `platform_meta.owner_company` / `owner_contact` |
| `ownerOrigins[]` | `platform_meta.owner_origins text[]` |
| `receiptSecretsDropped` y otros | `platform_meta.extra` |
| `companies[]` | `companies` |
| `users[]` | `users` |
| `businesses{companyId}` | tablas de negocio (abajo); `revision` → `companies.business_revision`; claves desconocidas → `companies.business_extra` |
| `payments[]` | `payments` |
| `requests{"userId\|requestId"}` → `{fingerprint, createdAt}` | `idempotency_keys(user_id, request_id, fingerprint, created_at)`; otros campos → `result` |
| `sessions{hash}` → `{userId, version, expires, support{companyId, reason, startedAt}}` | `sessions(token_hash, user_id, user_version, expires_at, support_company_id, support_reason, support_started_at)` |
| `audit[]` | `audit_log` con `scope='platform'` |
| `receipts{hash}` → `{companyId, saleId, expires}` | `receipts(token_hash, company_id, sale_id, expires_at)` |
| `loginFailures{k}` / `loginOrigins{k}` / `accountFailures{k}` / `passwordFailures{userId}` → `{count, until, alerted}` | `login_throttle(kind = login / origin / account / password, key, count, until, alerted)` |
| `securityEvents[]` → `{id, fecha, tipo, companyId, ...}` | `security_events(id, fecha, tipo, company_id, details jsonb = el resto)` |
| `supportTickets[]` | `support_tickets` + `ticket_messages` |
| `saleDrafts{"[companyId,userId,support]"}` → `{version, draft, writeId, saleId, updatedAt}` | `sale_drafts(company_id, user_id, support, version, draft jsonb, write_id, sale_id, updated_at)` |

### Empresa (`companies[]`)

| JSON | Columna |
|---|---|
| `id`, `name`, `slug`, `contact`, `nit`, `address`, `email`, `whatsapp` | mismas columnas |
| `logo` (data URL) | `logo` (BE-30 lo moverá a R2/S3) |
| `startDate` / `endDate` | `start_date` / `end_date` (date) |
| `monthlyFee` | `monthly_fee` NUMERIC |
| `enabled` | `enabled` |
| `createdAt` / `lastLoginAt` / `exportedAt` | `created_at` / `last_login_at` / `exported_at` |
| **`terms{version, acceptedAt, userId, username, name}`** | `terms_acceptances(company_id, version, accepted_at, user_id, username, name)` |

### Usuario (`users[]`)

| JSON | Columna |
|---|---|
| `id`, `companyId` (null = propietario), `username`, `name`, `email`, `emailVerified`, `role`, `active`, `version` | `id`, `company_id`, `username`, `name`, `email`, `email_verified`, `role`, `active`, `version` |
| `password{salt, digest, iterations, algorithm}` | `password_salt`, `password_digest`, `password_iterations`, `password_algorithm` |
| `passwordChangedAt`, `createdAt`, `lastLoginAt` | `password_changed_at`, `created_at`, `last_login_at` |
| **`mustChangePassword`** | `must_change_password` |
| **`totp{enabled, secret, lastCounter, enabledAt}`** | `totp_enabled`, `totp_secret`, `totp_last_counter`, `totp_enabled_at` |
| **`totp{pendingSecret, pendingAt}`** (configuración en curso) | `totp_pending_secret`, `totp_pending_at` |

### Negocio (`businesses[companyId]`)

| JSON | Tabla.columna |
|---|---|
| `revision` | `companies.business_revision` |
| `prods[]`: `id`, `nombre`, `categoria`, `referencia`, `marca`, `modelo`, `compatibilidad`, `codigo_barras`, `precio_compra` (null = desconocido), `precio_venta`, `stock`, `stock_minimo`, `foto` | `products` (mismas columnas) + `search_text` calculado |
| **`prods[].costHistory[]`**: `kind`, `documentId`, `costo_unitario`, `costo_compra`, `cantidad`, `stock_antes`, `total` | `product_cost_history(seq = posición, kind, document_id, costo_unitario, costo_compra, cantidad, stock_antes, total)` |
| `compras[]`: `id`, `fecha`, `usuario`, `userId`, `proveedor`, `total`, `anulada`, `estado_anterior` | `purchases` |
| `compras[].detalles[]`: `producto_id`, `nombre`, `cantidad`, `precio_unitario`, `costo_unitario`, `devuelto` | `purchase_lines(line_no = posición)` |
| `compras[].reversiones[]` | `reversals(doc_type='compra')` |
| `ventas[]`: `id`, `fecha`, `usuario`, `userId`, `cliente`, `telefono`, `customerId`, `placa`, `paymentMethod`, `subtotal_productos`, `subtotal_mano_obra`, `total`, `anulada`, `autorizadoPor`, `laborRefund` | `sales`: `id`, `fecha`, `usuario`, `user_id`, `cliente`, `telefono`, `customer_id`, `placa`, `payment_method`, `subtotal_productos`, `subtotal_mano_obra`, `total`, `anulada`, `autorizado_por`, `labor_refund` |
| **`ventas[].dataConsent{consentAt, consentBy, consentMedium}`** | `sales.data_consent_at`, `data_consent_by`, `data_consent_medium` |
| **`ventas[].receiptHash`**, `receiptExpiresAt` | `sales.receipt_hash`, `receipt_expires_at` |
| `ventas[].detalles[]` | `sale_lines` |
| `ventas[].labor[]`: `descripcion`, `mecanicoId`, `mecanico`, **`mecanicoPorcentaje`**, `importe` | `sale_labor(descripcion, mecanico_id, mecanico, mecanico_porcentaje, importe)` |
| `ventas[].reversiones[]`: `id`, `fecha`, `usuario`, `motivo`, `parcial`, `detalles[{index, cantidad}]`, **`fechaComercial`**, **`afterClosure`** | `reversals(doc_type='venta', seq, id, fecha, usuario, motivo, parcial, detalles jsonb, fecha_comercial, after_closure)` |
| `ventas[].devolucion_mano_obra` (heredado) | `sales.extra` (el reporte SQL lo lee de allí) |
| `servs[]`: `id`, `venta_id`, `fecha`, `fecha_entrega`, `usuario`, `userId`, `cliente`, `telefono`, `customerId`, `placa`, `marca_moto`, `descripcion_trabajo`, `mecanico`, `costo_mano_obra`, `subtotal_productos`, `subtotal_mano_obra`, `total`, `estado`, `estado_anterior`, `paymentMethod`, `anulada` | `services` (mismos nombres en snake_case) |
| `servs[].labor[]` (copia de la venta) | `services.labor jsonb` |
| `servs[].detalles[]` / `servs[].reversiones[]` | `service_lines` / `reversals(doc_type='servicio')` |
| `movimientos[]`: `id`, `fecha`, `producto_id`, `nombre`, `cantidad`, `tipo`, `usuario`, `userId`, `stock_antes`, `stock_despues`, `tipo_documento`, `documento`, `motivo`, `supportReason` | `stock_movements` (+ `fecha_comercial` generada) |
| `auditoria[]`: `id`, `fecha`, `usuario`, `userId`, `accion`, `documento`, `motivo`, `antes`, `despues` (+ `supportReason`, `autorizadoPor`, `ventas`… en `extra`) | `audit_log(scope='business', company_id, ...)` |
| **`mechanics[]`**: `id`, `name`, **`percentage`**, `active`, `createdAt`, `updatedAt` | `mechanics` |
| **`cashClosures[]`**: `id`, `date`, `createdAt`, `userId`, `username`, `name`, `note`, `businessRevision` | `cash_closures` (mismas columnas) |
| `cashClosures[].totals{expected, actual, difference}` | `expected_total`, `actual_total`, `difference_total` |
| `cashClosures[].expected{}`, `actual{}`, `differences{}`, `summary{}` (snapshot) | `expected`, `actual`, `differences`, `summary` (jsonb) |
| `customerRecords[]`: `id`, `nombre`, `telefono`, `consentAt`, `consentBy`, `consentMedium`, `erasedAt`, `erasedBy` | `customers` |

### Tickets

| JSON | Tabla.columna |
|---|---|
| `supportTickets[]`: `id`, `companyId`, `createdBy`, `creatorName`, `title`, `description`, `status`, `createdAt`, `updatedAt`, `readers{userId: n}` | `support_tickets` (`readers jsonb`) |
| `supportTickets[].messages[]`: `id`, `userId`, `name`, `role`, `message`, `kind`, `createdAt` | `ticket_messages(seq = posición)` |

No se guardan, como hoy: `customers` y `vehicles` de `aggregates()`, que son cálculos de la respuesta, ni
el token o la URL del comprobante en claro (SEG-03).

## 5. Verificación de la importación (DM-04 / QA-16)

`db/verify.mjs` calcula las mismas sumas dos veces y por caminos independientes: desde el JSON, con
JavaScript sobre los arreglos, y desde Postgres, con agregados SQL. La aprobación exige **cero
diferencias**. El dinero se compara en centavos enteros.

| Clave | Métricas |
|---|---|
| empresa · `sales` · día | ventas, total, anuladas, líneas, unidades, devueltas, importe de líneas, líneas y valor de mano de obra, reversiones |
| empresa · `purchases` / `services` · día | documentos, total, anulados, líneas, unidades, devueltas, importe, reversiones |
| empresa · `products` | productos, stock total, historial de costos, suma de precios |
| empresa · `products.stock` · producto | stock de **cada** producto |
| empresa · `stock_movements` · día de Bogotá | movimientos, suma de cantidades |
| empresa · `cash_closures` · día | cierres, esperado, contado, diferencia |
| empresa · `payments` · día | pagos e importe |
| empresa · usuarios, clientes, mecánicos, tickets y mensajes, borradores, comprobantes, auditoría | conteos |
| plataforma · sesiones, límites, idempotencia, eventos, auditoría global | conteos |

CLI: `SCORTA_DATABASE_URL=... node db/import-json.mjs data/platform.sqlite --verify`.

## 6. Particionado y archivo (DM-11), solo plan

Volumen esperado: 30 empresas × 800 ventas/día ≈ 24.000 ventas/día ≈ **8,8 millones de ventas al
año**, con unas 2 líneas y 2 movimientos por venta (≈ 17 millones de filas al año en cada una de
`sale_lines` y `stock_movements`). Los índices `(company_id, fecha)` sostienen bien hasta unos 10
millones de filas por tabla. Ese umbral se alcanza en el primer año para `sales` y en unos 7 meses
para líneas y movimientos.

Plan, cuando una tabla supere ~10 M filas o su índice principal deje de caber en memoria:

1. **Particionado por rango de fecha, mensual**:
   - `sales PARTITION BY RANGE (fecha)`; `stock_movements PARTITION BY RANGE (fecha)`;
     `audit_log` por `fecha`.
   - Las hijas (`sale_lines`, `sale_labor`) necesitan la fecha para particionarse igual. Se añade
     `sale_fecha date` desnormalizada y la FK pasa a `(company_id, sale_fecha, sale_id)`.
   - La PK de cada tabla particionada debe incluir la clave de partición: `(company_id, fecha, id)`.
     La unicidad global del id se garantiza porque los ids ya llevan marca de tiempo y aleatorio.
   - Particiones creadas por adelantado (12 meses) por una migración o un trabajo programado.
   - Los reportes y el listado ya filtran por `fecha`, así que la poda de particiones es automática.
2. **Migración sin ventana larga**: crear la tabla particionada nueva, copiar por meses con
   `INSERT ... SELECT` en lotes, cambiar el nombre dentro de una transacción corta y verificar con
   `db/verify.mjs`.
3. **Archivo**: las particiones de más de 24 meses se separan (`DETACH PARTITION`), se exportan a
   Parquet o CSV comprimido en R2/S3 con su suma de control y se conservan durante el plazo legal
   (10 años para soportes contables en Colombia). Solo se eliminan de la base después de
   verificar el archivo y con la aprobación del dueño. Los reportes históricos se responden desde
   tablas resumen mensuales (`sales_monthly`: empresa, mes, medio de pago, bruto, devoluciones, neto).
4. **No particionar por empresa**: 30 empresas con tamaños muy distintos darían particiones
   desbalanceadas. `company_id` ya encabeza todos los índices.

## 7. Cómo se prueba

| Prueba | Qué cubre |
|---|---|
| `tests/pg-migraciones.test.mjs` | Aplicar desde cero, deshacer y volver a aplicar; transacción por migración; checksum; `.down` obligatorio; la reversa se niega con datos reales |
| `tests/pg-import.test.mjs` | Estado real (3 empresas) creado con `platformRequest`; cero diferencias; se detectan las alteraciones; todo o nada; nada se pierde; lectura de `platform.sqlite` |
| `tests/pg-repository.test.mjs` | Búsqueda, listado paginado, venta transaccional, concurrencia por la última unidad, idempotencia, reporte SQL igual a `admin-reports.mjs`, sesiones y límites, generador sintético |
| `tests/pg-aislamiento.test.mjs` | Prueba cruzada: A nunca lee ni escribe en B; FK compuestas |

Sin `SCORTA_TEST_DATABASE_URL` las pruebas usan PGlite. En CI (`postgres:16`), cada archivo crea su
propio esquema aleatorio y lo elimina al terminar.
