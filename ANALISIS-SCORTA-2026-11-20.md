# Análisis profundo de SCORTA — 2026-11-20

## Estado de correcciones (2026-11-20)

Hay una copia del código anterior en `_respaldo-2026-11-20/`.

**Pruebas:** 241 de 242 pasan y 1 se omite (la credencial JE); antes pasaban 224 de 237. En `owner-concurrency.test.mjs`, el bundler cargaba dos copias del módulo de hooks de prueba en Windows; ahora se usa un único módulo virtual. La compilación funciona.

| Corregido | Dónde |
|---|---|
| El servidor fija la fecha de venta: el vendedor siempre registra la de hoy; el admin no puede usar fechas futuras ni días con caja cerrada | `platform.mjs` (`saleDate`) |
| El vendedor solo ve los clientes de sus ventas y no puede renombrar el registro compartido de clientes | `platform.mjs` (`envelope`, `customerFor`) |
| Se depuran las claves de idempotencia (>90 días) y los enlaces de comprobante vencidos; `ticket.read` ya no se audita; límite de 50 tickets abiertos por empresa | `platform.mjs`, `support-tickets.mjs` |
| Un archivo PID huérfano ya no bloquea el arranque; el cierre por SIGTERM ahora es ordenado | `platform-server.mjs`, `server.mjs` |
| La IP real del cliente se toma de la cabecera definida en `SCORTA_CLIENT_IP_HEADER` | `platform-server.mjs` |
| `/healthz`, un log JSON por petición, errores 500 que no exponen detalles internos, HSTS, `Referrer-Policy` y CSP con `base-uri`/`form-action` | `server.mjs`, `platform-server.mjs` |
| Node 24 fijado (`engines`), aviso sobre respaldos en OPERACION.md y `.env.example` con las variables de Render | `package.json`, docs |
| Las pruebas ya funcionan en Windows | `tests/` |
| 5 pruebas nuevas que cubren las correcciones | `tests/correcciones-2026-11-20.test.mjs` |
| Costo con promedio ponderado al comprar (anular una compra vuelve a la fuente anterior) | `inventory.mjs` |
| Sesión del propietario de 12 h y modo soporte que se cierra solo a las 2 h | `platform.mjs` |
| Buscador en Nueva venta: escribir y presionar Enter agrega el producto al carrito (sin lector de códigos) | `ClientWorkspace.jsx` |
| La app no recarga datos con la pestaña oculta; inventario y ventas se muestran de a 100 | `PlatformApp.jsx`, `ClientWorkspace.jsx` |
| Se borró código muerto: `App.jsx`, `SessionGate.jsx`, `demo-main.jsx`, `demo-api.mjs`, `style.css` y su prueba | `src/` |

**Pruebas tras la segunda ronda:** 235 de 236 pasan y 1 se omite. Compilan la app y la demo; el buscador se probó en la demo.

Este análisis lo hicieron 5 agentes especialistas en paralelo: seguridad, backend y lógica de negocio, frontend y UX, QA y pruebas, y arquitectura y DevOps. Todos trabajaron en modo solo lectura sobre `SCORTA/`.

Cada hallazgo indica si se comprobó en el código (**CONFIRMADO**) o si depende del entorno (**POSIBLE**). Los marcados con ✔ los verificó además el coordinador.

## Resumen ejecutivo

SCORTA tiene una base sólida en seguridad clásica y en exactitud contable:
- No hay inyección SQL, XSS, IDOR ni path traversal.
- CSRF está bien resuelto.
- El dinero se redondea con BigInt.
- El cobro es idempotente.
- Ningún flujo permite stock negativo.
- La cobertura de pruebas es del 87 % de ramas.

Los riesgos se concentran en cuatro frentes:

1. **Persistencia en un único documento JSON.** Toda la plataforma (todas las empresas, sesiones, auditoría y logos) vive en una sola fila de SQLite. Cada petición la parsea entera y cada escritura la reescribe entera. Las colecciones crecen sin poda. Una empresa puede degradar o tumbar a todas las demás.
2. **Operación en producción.** El contenedor puede quedar en un bucle de reinicio. La guía de operación programa el respaldo equivocado. No hay observabilidad.
3. **Reglas de negocio con huecos.** Hay ventas con fecha libre que alteran cierres "inmutables" y un costo de inventario que no es promedio. Además, un vendedor ve datos de otros vendedores.
4. **Experiencia en caja.** La aplicación recarga el estado completo cada 15 s. Falta captura rápida o escáner y el formato de moneda es inconsistente.

---

## Despliegue en Render (contexto de producción)

SCORTA se publicará en **Render**. Por eso Caddy y `compose.yaml` no se usan: Render pone HTTPS y el proxy. El servicio será un *Web Service* (runtime Node o Docker) con un *Persistent Disk* para SQLite. Esto cambia la prioridad de varios hallazgos y agrega requisitos.

### Requisitos que el código o la configuración aún no cubren

| # | Requisito en Render | Estado actual | Acción |
|---|---|---|---|
| R1 | **Disco persistente obligatorio.** Sin él, el sistema de archivos se borra en cada deploy o reinicio, y con él todas las ventas. Los discos solo existen en planes pagos; el plan gratuito no sirve. | `DATA_DIR` existe (`server.mjs:45-46`) | Plan pago, disco montado (p. ej. `/var/data`) y `DATA_DIR=/var/data` |
| R2 | **Escuchar en `0.0.0.0`.** | Por defecto `HOST=127.0.0.1` (`server.mjs:84`). El Dockerfile sí pone `0.0.0.0`, pero el runtime Node no lo usa. | Variable `HOST=0.0.0.0` (o cambiar el valor por defecto) |
| R3 | **Versión de Node.** `node:sqlite` requiere Node moderno, y Render usa su versión por defecto si no se fija otra. | `package.json` no tiene `engines` ni `.node-version` | `"engines": {"node": "24.x"}` o `NODE_VERSION=24` |
| R4 | **Variables de producción.** | — | `NODE_ENV=production`, `SCORTA_PUBLIC_URL=https://<servicio>.onrender.com` (o el dominio propio; si no coincide, el control de `Origin` rechaza todos los POST), y `SCORTA_OWNER_*` como secretos. Cambiar los valores por defecto `Fragola`/`Steven`. |
| R5 | **Health check.** Render lo usa para dar el deploy por bueno y reiniciar si falla. | No hay endpoint | Crear `/healthz` y configurar *Health Check Path* |
| R6 | **Respaldos.** Render toma snapshots diarios del disco, pero no son una copia externa ni puntual. Un disco solo se monta en **un** servicio, así que un *Cron Job* de Render **no puede** leer `platform.sqlite`. | `platform-backup.mjs` solo se puede usar por CLI | Programar el respaldo **dentro del propio web service** (temporizador interno: `snapshot()` → subir a S3/B2/R2) o con un endpoint autenticado de solo propietario. Ensayar la restauración con Render Shell. |
| R7 | **Docker con usuario no root.** Si se usa el runtime Docker, el disco se monta sobre `/data` y puede quedar con propietario root; `USER node` no podría escribir. **POSIBLE**: verificar en el primer deploy. | `Dockerfile:13-14` | Verificar permisos o usar el runtime Node nativo (más simple) |

### Fase actual: plan gratuito de Render (decisión del 2026-11-20)

El plan gratuito **no tiene disco persistente** y la instancia se apaga tras unos 15 minutos sin tráfico. Consecuencias:

- **Los datos se borran** en cada deploy, en cada reinicio y cada vez que la instancia se duerme. `platform.sqlite` vuelve a crearse vacío y el propietario se recrea desde las variables `SCORTA_OWNER_*`.
- **El primer acceso tras dormir tarda** unos 30-60 s mientras la instancia despierta.
- **El bloqueo PID no ocurre** en esta fase, porque el archivo desaparece con el sistema de archivos. Vuelve a ser crítico al pasar a plan pago con disco.

**Uso recomendado mientras sea gratis:** solo pruebas y demostraciones con datos ficticios. Nunca ventas, inventario ni clientes reales.

Dos opciones válidas:
1. **Static Site gratuito con la demo** (`npm run build:demo`, salida `dist-demo`). Los datos viven en el navegador (IndexedDB), no se pierden al dormir y no hay servidor que despertar. Es la mejor opción para mostrar el producto.
2. **Web Service gratuito con el servidor real.** Sirve para probar login, roles y flujos multiusuario, asumiendo que todo se reinicia con frecuencia.

**Antes de cargar datos reales:** pasar a plan pago con disco y cumplir R1-R7, el bloqueo PID, la fecha de venta y los respaldos externos.

### Hallazgos que cambian de prioridad con Render

- **#1 Bloqueo PID → sube a CRÍTICO y se generaliza.**
  - Con disco persistente, Render **no hace deploys sin caída**: detiene la instancia vieja y arranca la nueva. Envía SIGTERM y, si el proceso no termina en el plazo de gracia, SIGKILL.
  - `server.close()` espera las conexiones activas (`server.mjs:84`). Si llega el SIGKILL, el `platform.sqlite.pid` queda en el disco persistente.
  - La nueva instancia arranca en otro contenedor, donde los PID son bajos y se reutilizan. Si el PID guardado coincide con algún proceso vivo, incluido el propio Node, el arranque aborta y **el deploy falla en bucle**.
  - Pasa en el runtime Node y en el Docker.
  - Corrección: borrar el lock si el PID guardado es igual a `process.pid` o no es un proceso `node` de SCORTA. Lo más simple en Render, con una sola instancia garantizada, es usar un lock de SQLite (`BEGIN EXCLUSIVE` en una tabla de lock) o eliminar el archivo PID. Añadir también `server.closeAllConnections()` tras un timeout en SIGTERM.
- **#5 Rate limit global → sigue siendo ALTO.** Detrás del balanceador de Render, `req.socket.remoteAddress` es la IP del proxy. El test `audit-api-security.test.mjs:99` fija a propósito que no se confíe en `X-Forwarded-For`. En Render hay que leer la IP del cliente desde `X-Forwarded-For` (lo añade el proxy de Render), activado solo con una variable como `TRUST_PROXY=render`, y cambiar ese test.
- **#2 y #19 (OPERACION.md, Compose, Caddy, digests) → bajan.** Compose y Caddy no aplican. Hay que reescribir OPERACION.md para Render (ver R6).
- **#14 HSTS y cabeceras.** Sin Caddy, la aplicación debe emitir `Strict-Transport-Security` por sí misma (en `server.mjs:56`), junto con `Referrer-Policy`.
- **#4 Estado en un solo JSON → más sensible.** Render cobra por RAM y CPU: los planes pequeños tienen 512 MB. El JSON completo se parsea y se clona varias veces por petición, así que la memoria crece con todas las empresas. Un OOM reinicia la instancia, y eso lleva de nuevo al riesgo del PID. Medir el tamaño del estado y elegir el plan en consecuencia.
- **#7 Observabilidad.** Render captura stdout/stderr en sus logs, así que basta con un log JSON por petición más los errores 5xx en `console.error`. Se pueden enviar a un *Log Stream* externo.
- **Escalado horizontal:** no es posible con disco (1 instancia). Coincide con la arquitectura actual de un solo proceso. Escalar más allá requiere PostgreSQL gestionado de Render (horizonte largo plazo).

---

## Hallazgos prioritarios (consolidados y sin duplicados)

### 🔴 Críticos / Altos

| # | Hallazgo | Ubicación | Fuente |
|---|---|---|---|
| 1 | **Bucle de reinicio en Docker por el archivo PID.** Node corre como PID 1. Tras un cierre abrupto queda `platform.sqlite.pid` con "1"; al reiniciar, `process.kill(1,0)` se encuentra a sí mismo y el arranque aborta "La plataforma ya está abierta". `restart: unless-stopped` repite el ciclo. No se compara con `process.pid`. ✔ | `platform-server.mjs:16` | Arquitectura |
| 2 | **OPERACION.md programa el respaldo equivocado.** El cron y Compose usan `backup.mjs`/`restore.mjs`, que solo cubren `motoshop.sqlite` y no `platform.sqlite`. Quien siga la guía no respalda los datos multiempresa. Tampoco hay respaldo automático, retención ni copia externa. | `docs/OPERACION.md:44,57,92` | Arquitectura |
| 3 | **Ventas con fecha libre.** `fecha` viene del cliente sin cota ni control de rol. Un vendedor puede registrar ventas en un día con caja ya cerrada (altera un cierre "inmutable") o en el futuro (esconde efectivo de la caja de hoy). Reproducido por script. ✔ | `platform.mjs:264` | Backend |
| 4 | **Denegación de servicio entre empresas.** Todo el estado está en un JSON que se parsea en cada petición (incluido `GET /api/v2/session` anónimo) y se reescribe en cada POST, con una cola global. `requests`, `receipts`, `audit`, `movimientos` y tickets crecen sin límite: cada ticket admite 500 mensajes de 5.000 caracteres y no hay tope de tickets. Además, `ticket.read` escribe auditoría y sube la revisión en cada lectura. | `platform-server.mjs:29-37`, `platform.mjs:114,274,293,362`, `support-tickets.mjs:115` | Seguridad, Backend, Arquitectura |
| 5 | **El rate limit de login se vuelve global detrás de Caddy.** Usa `req.socket.remoteAddress`, que siempre es la IP del proxy. Con 60 intentos por minuto un atacante bloquea el login de todas las empresas. Con 10 fallos contra `Fragola`/`Steven` (valores por defecto) bloquea al propietario 15 minutos, repetible. | `platform-server.mjs:146-160`, `platform.mjs:114-129` | Seguridad, Arquitectura |
| 6 | **Costo de inventario = último costo, no promedio.** Con 10 u a 10.000 y una compra de 1 u a 20.000, todo el stock pasa a costar 20.000 (el promedio sería 10.909). La utilidad de los reportes queda distorsionada. *Requiere decisión de negocio.* | `inventory.mjs:63` | Backend |
| 7 | **Observabilidad nula.** No hay log de peticiones. Las excepciones se responden como 400, sin registrarse y exponiendo `error.message`. No hay `/healthz` ni `HEALTHCHECK`. | `server.mjs:83`, `platform-server.mjs:78,165` | Arquitectura, Seguridad |

### 🟠 Medios

| # | Hallazgo | Ubicación |
|---|---|---|
| 8 | **El vendedor ve clientes, teléfonos y gasto acumulado de ventas ajenas.** Los agregados se calculan antes de filtrar. Contradice LEEME.md. | `platform.mjs:163-173` |
| 9 | **Un vendedor puede renombrar un cliente globalmente** registrando una venta con su teléfono. | `platform.mjs:191-192` |
| 10 | **Conflictos 409 falsos con varias cajas.** La revisión es global por negocio y la suben acciones que no tocan stock. El reintento del borrador reutiliza la revisión vieja. Además, si se omite `revision`, se salta la protección (relevante en `ajuste`). | `platform.mjs:245,359-360`, `sale-drafts.mjs:25` |
| 11 | **Propietario sobreexpuesto.** Sesión de 30 días sin caducidad por inactividad ni 2FA. El modo soporte da permisos completos en cualquier empresa y no caduca. | `platform.mjs:13,143,233` |
| 12 | **Hash débil.** PBKDF2-SHA256 con 120k iteraciones (OWASP recomienda ≥600k o scrypt/Argon2id). Mínimo de 8 caracteres. | `platform.mjs:82` |
| 13 | **Enumeración de cuentas por tiempo de respuesta.** PBKDF2 solo se ejecuta si el usuario existe. | `platform.mjs:127-128` |
| 14 | **Faltan HSTS, `Referrer-Policy` y `base-uri`/`form-action` en la CSP.** Caddy no tiene límites de cuerpo ni logs. | `server.mjs:56`, `Caddyfile` |
| 15 | **Comprobante público con datos personales** (nombre, teléfono, placa) durante 7 días. El token se guarda en claro dentro de la venta, lo que anula el hash del índice. | `platform.mjs:73-79,271,280` |
| 16 | **Datos reales de un cliente (nombre y WhatsApp) en el bundle público de la demo.** | `src/je-trial-demo.mjs:8` |
| 17 | **Clave anon de Supabase de PRENOTA en la raíz, sin `.gitignore`.** Solo es segura si el RLS está bien. Un `git add .` la publica. | `config.js:2` |
| 18 | **Restauración:** conserva `pendingSale`/`requests` del snapshot (riesgo de cobro duplicado al restaurar uno antiguo) y deja sidecars `-wal`/`-shm` vacíos. En Windows el archivo queda con permisos `0666`. | `platform-backup.mjs:24-26` |
| 19 | **Imágenes Docker sin digest.** El CI no construye la imagen y el Dockerfile lista archivos a mano. `SCORTA_OWNER_PASSWORD` es visible con `docker inspect`. | `Dockerfile:1,5,12`, `compose.yaml` |

### 🟡 Bajos (resumen)

- **Fechas del servidor:** `aplicarCambio` usa `new Date()` en lugar del `now` inyectado (`inventory.mjs:27-69`).
- **Reportes:** sumas en float sin `roundMoney` en compras, valor de stock y venta promedio (`admin-reports.mjs:107,118`).
- **Contraseñas:**
  - El cambio de contraseña no limita intentos (`platform.mjs:348`).
  - El restablecimiento no obliga a cambiarla en el siguiente acceso (`:231`).
- **Servidor legacy:**
  - El operador fija precios libres y ve costos (`server.mjs:71,75`).
  - Modo loopback sin contraseña si no hay `NODE_ENV` (`auth.mjs:220`).
- **Comprobante:** `safeReceiptImage` acepta `http:` (`src/receipt-ticket.mjs:8`).

---

## Frontend y UX

- **Polling cada 15 s del estado completo, aun con la pestaña oculta.** Probablemente incluye las fotos en base64 (hasta 700 KB cada una). Afecta datos y batería en el celular (`PlatformApp.jsx:37`).
- **Sin memoización, paginación ni debounce** en inventario y ventas. Los conteos por categoría son O(n·c) (`ClientWorkspace.jsx:162-250`).
- **Caja lenta:**
  - La pantalla de venta no tiene buscador.
  - No se puede agregar con Enter ni con lector de código de barras.
  - Aparece `window.confirm` al quitar cada línea.
- **El borrador puede bloquear toda la app** si `/api/v2/draft` falla, incluido Inventario para el admin (`ClientWorkspace.jsx:77,230`). `response.json()` sin try/catch muestra un `SyntaxError` crudo cuando hay un 502 (`sale-draft-client.mjs:6`).
- **Doble mecanismo de reintento**, con errores mostrados dos veces.
- **Moneda inconsistente:** hay más de 10 formateadores. El mismo valor 12000.5 aparece como "$ 12.000,5" en el carrito y como "$ 12.001" en el ticket.
- **Código muerto:** `App.jsx` (70 KB), `SessionGate.jsx`, `demo-main.jsx`, `demo-api.mjs` y `style.css`. Las capturas de `docs/capturas` muestran esa UI vieja.
- **Bundle:**
  - Sin code splitting por rol; el vendedor descarga el panel del propietario.
  - `OwnerWorkspace.jsx:5` importa `platform.mjs` del servidor.
  - El logo webp pesa 261 KB.
- **Accesibilidad:**
  - 7 implementaciones distintas de diálogo, con foco mal gestionado.
  - `aria-describedby` apunta a ids inexistentes.
  - Menús `<details>` sin Escape.
  - Se usan `window.prompt` y `window.confirm`.
- **Móvil:** botones de 30–36 px (por debajo de 44) e inputs de menos de 16 px, que provocan zoom en iOS.
- **CSS:** 45 KB minificados a mano, 34 `!important`, 73 colores hex, 20 clases sin uso y `--cw-red` que en realidad es amarillo.

## Pruebas y CI

- **`npm test` en Windows (Node 26):** 237 tests, **224 ✅, 12 ❌, 1 omitido**, estable en 3 corridas. Los 12 fallos son de portabilidad:
  - 8 por `new URL().pathname`, que genera `C:\C:\...` (`admin-tools-ui.test.mjs:10`, `audit-finance-regression.test.mjs:110`).
  - 3 por separadores de ruta en `owner-concurrency.test.mjs:21`.
  - 1 por permisos `0o600` en `restore-wal.test.mjs:28`, que refleja un problema real en Windows.

  La auditoría previa reportaba 181/181 porque se ejecutó en otro entorno.
- **Cobertura:** 95 % de líneas (engañoso por las líneas largas), **87 % de ramas** y 93 % de funciones. Los `.jsx` no se miden. Las zonas bajas son `server.mjs` (53 %) y `platform-backup.mjs` (67 % de ramas).
- **Áreas sin cubrir:** concurrencia real en el store SQLite (cola y `REVISION_CONFLICT`) y el arranque y las cabeceras de `server.mjs`.
- **Calidad de las pruebas:**
  - Aserciones débiles: `status>=400` y `includes` sobre el HTML.
  - Las pruebas de UI reimplementan los hooks de React con `new Function`, algo frágil.
  - Algunas dependen del reloj real.
- **CI:**
  - No corre en Windows, aunque el producto trae `INICIAR.cmd`.
  - Las actions no están fijadas por SHA.
  - No publica cobertura ni sube artefactos salvo cuando falla.
  - Los builds se repiten.
  - `npm audit` puede romper el pipeline sin que cambie el código.
- **Playwright no se ejecutó localmente:** falta chromium-1254.

**Tests más valiosos que faltan:**
1. Concurrencia SQLite real (dos ventas por la última unidad).
2. Devolución en D+1 de una venta de un día ya cerrado.
3. Idempotencia ampliada.
4. Reintento de `sale.reverse`.
5. Matriz de aislamiento acción × id ajeno.
6. Restauración con respaldos corruptos o de `schemaVersion` desconocido.
7. Arranque y cabeceras de `server.mjs`.
8. Pruebas de propiedades para el dinero.
9. Endpoints legacy.
10. Vendedor renovando un recibo ajeno.

## Arquitectura y deuda técnica

```
Internet → Caddy (TLS) → Node 24 server.mjs (1 proceso)
             ├─ /api/v2 → platform-server → platform.mjs → platform.sqlite (1 fila = JSON con TODO)
             ├─ /api     → legacy motoshop (auth.mjs) → motoshop.sqlite (se abre siempre)
             └─ estáticos dist/ (React 19)
Raíz del repo: PRENOTA (otro producto) mezclado
```

- **`platform.mjs`:** 40 KB en 374 líneas, con líneas de más de 700 caracteres. `applyAction` es una cadena if/else que mezcla auth, multiempresa, ventas, comprobantes, auditoría y proyección por rol.
- **Utilidades duplicadas:** `fail`, `norm`, validadores y el formateador de Bogotá se repiten en 5 o 6 módulos.
- **Esquema implícito:** fallbacks legados como `labor||mano_obra||servicios`, sin migraciones, índices ni claves foráneas.
- **Dos sistemas de auth** (scrypt legacy y PBKDF2 de la plataforma) y un modo motoshop que aún se carga.
- **Repo:** 20 `.mjs` planos en la raíz, el paquete se llama `motoshop` y PRENOTA está mezclado.
- **Documentación:** unos 30 documentos, de los cuales unos 12 son históricos. Hay contradicciones: OPERACION.md dice que las sesiones no sobreviven al reinicio y `seguridad.md` habla de sesiones de 8 h.

---

## Hoja de ruta recomendada

**Inmediato (antes de cualquier piloto, 1-2 semanas)**
0. **Preparar Render (R1-R6):**
   - Disco persistente y `DATA_DIR`.
   - `HOST=0.0.0.0`.
   - Fijar Node 24.
   - `NODE_ENV` y `SCORTA_PUBLIC_URL`.
   - `/healthz`.
   - Respaldo programado dentro del servicio hacia almacenamiento externo.
   - `render.yaml` versionado con todo lo anterior.
1. **Bloqueo PID:** que no aborte por un archivo huérfano tras un SIGKILL de Render (ver la sección Render). Cerrar las conexiones al recibir SIGTERM.
2. **Fecha de venta:** fijarla en el servidor para vendedores. Para admin, solo fechas `≤ hoy`, sin cierre y con motivo auditado.
3. **Respaldos:** reescribir OPERACION.md con `platform-backup.mjs`, programar respaldo con retención y copia externa, y ensayar una restauración.
4. **Rate limit:** usar `X-Forwarded-For` del proxy de Render (activado por variable) y aplicar bloqueo progresivo por cuenta. Actualizar `audit-api-security.test.mjs:99`.
5. **Poda y topes:**
   - Podar `requests`, `receipts` y `audit`.
   - Topes de tickets y mensajes.
   - Sacar `ticket.read` de la auditoría.
6. **Agregados por rol:** filtrar los agregados del vendedor y no mutar el nombre del cliente desde la venta.
7. **Observabilidad:** log JSON por petición, distinguir 4xx de 5xx sin filtrar mensajes internos, `/healthz` y `HEALTHCHECK`.
8. **Higiene:**
   - Quitar la PII real de la demo.
   - `.gitignore` en la raíz y sacar PRENOTA.
   - HSTS, `Referrer-Policy` y CSP completa.
9. **Portabilidad de tests:** cambiar a `fileURLToPath` y añadir Windows al CI.

**1-2 meses**
- Decidir costo promedio o último costo e implementarlo con su reversión.
- Usar revisión por producto en lugar de global por negocio.
- Sacar logos e imágenes del JSON y llevar las sesiones a una tabla propia.
- Empezar la migración relacional por las tablas de alto crecimiento: ventas, movimientos y auditoría.
- **Seguridad:** 2FA y sesión corta para el propietario, soporte con caducidad, scrypt o Argon2id con rehash, hash ficticio contra la enumeración.
- **Frontend:**
  - Polling con pausa y ETag.
  - Buscador o escáner en Nueva venta.
  - `format.mjs` único.
  - Diálogo accesible único.
  - Dividir `ClientWorkspace`.
  - Code splitting por rol.
  - Borrar el código muerto.
- Escribir los 10 tests prioritarios, construir la imagen Docker en CI y fijar los digests.
- Consolidar la documentación: índice, ADR de persistencia y carpeta `historico/`.

**Largo plazo (3-12 meses)**
- Con más de 10-20 empresas o concurrencia sostenida: pasar a PostgreSQL, o usar LibSQL/Litestream como paso intermedio, con aislamiento por `company_id` en la capa de datos.
- Retirar el modo legacy motoshop y reorganizar el código en `server/`, `domain/` y `ops/` con un formateador en CI.
- Despliegue reproducible: imagen por commit, staging/prod, migraciones automáticas y rollback documentado.

## Lo que está bien hecho

- **CSRF:** Origin estricto, solo JSON y cookie `SameSite=Strict`, HttpOnly y Secure.
- **Sesiones:** tokens de 256 bits de los que solo se guarda el hash, rotación e invalidación por versión, y revalidación en cada petición.
- **Aislamiento entre empresas:** la empresa siempre sale del usuario en el servidor; no se encontró IDOR.
- **Consultas y XSS:** SQL parametrizado, escape completo en tickets, CSP sin `unsafe-inline` en scripts y validación de magic bytes en el logo.
- **Importación:** ZIP validado contra bombas y fórmulas rechazadas en Excel/CSV.
- **Dinero:** cálculo con BigInt y redondeo half-up; cobro idempotente; stock nunca negativo; devoluciones sin duplicar unidades.
- **Zona horaria:** se aplica `America/Bogota` de forma consistente.
- **Contenedor:** corre como usuario no root y solo Caddy publica puertos.
