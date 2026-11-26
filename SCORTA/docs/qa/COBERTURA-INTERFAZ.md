# Cobertura de la interfaz (QA, auditoría punto 10)

Hay **dos** medidas de cobertura y no son comparables entre sí:

| Comando | Qué mide | Umbral | Dónde corre |
|---|---|---|---|
| `npm run test:coverage` | **Lógica de servidor y módulos de la raíz** (`platform.mjs`, `server.mjs`, `db/`, `caja-credito.mjs`, …) ejecutada por `node --test`. Excluye `tests/**` y `browser-*/**`. **No incluye `src/*.jsx`.** | líneas 85 %, ramas 80 % (bloqueante) | CI, job «Node tests», solo Linux |
| `npm run test:coverage:ui` | **La interfaz (`src/**`) ejecutándose en Chromium** con los specs de Playwright. | líneas 75 %, funciones 45 %, ramas 60 % | local y CI (job opcional, no bloqueante) |

Por eso el «95 %» que se cita de `test:coverage` es de lógica de servidor: los componentes React solo se
veían por SSR (`renderToStaticMarkup`) o con arneses, y esas pruebas no entran en ese reporte.

## Cómo se mide la interfaz

`browser-checks/coverage-ui.mjs`:

1. Compila una copia **sin minificar y con mapas de fuente** en `dist-coverage/` (no toca `dist/`).
2. Ejecuta los specs de Playwright (proyecto `escritorio`) con `SCORTA_UI_COVERAGE=1`. El fixture
   (`browser-checks/fixtures.mjs`, fixture `page`) redirige `/` y `/assets/*` a `dist-coverage/` con
   `page.route` y activa `page.coverage.startJSCoverage()`. Al terminar cada prueba guarda la cobertura V8 cruda en
   `test-results/ui-coverage/raw/`. Sin la variable de entorno nada de esto actúa.
3. Funde la cobertura de todas las pruebas por script (`@bcoe/v8-coverage`) y la traduce a los archivos originales
   de `src/` con los mapas de fuente (`v8-to-istanbul`). Imprime líneas, funciones y ramas por archivo, escribe
   `test-results/ui-coverage/summary.json` y `lcov.info`, y **falla si el total baja de los umbrales**.

Dependencias nuevas (solo `devDependencies`, versión exacta, `npm audit` limpio): `v8-to-istanbul@9.3.0` y
`@bcoe/v8-coverage@1.0.2`. Se descartó `c8` porque su árbol de dependencias trae 4 avisos moderados de `npm audit`
(glob/minimatch) que harían fallar el paso de auditoría del CI.

```
npm run build                          # dist/ (lo exige serve.mjs; el comando compila dist-coverage solo)
npm run test:coverage:ui               # compila, corre los specs y muestra la tabla (~4 min)
node browser-checks/coverage-ui.mjs --no-run   # solo rehace la tabla con la última corrida
node browser-checks/coverage-ui.mjs -- credito # pasa argumentos a playwright (cobertura parcial: ojo con el umbral)
```

Usa el puerto 19440 (`SCORTA_UI_COVERAGE_PORT` para cambiarlo) para no chocar con `test:ui` (19420).

## Cifras (corrida del 2026-11-25, proyecto escritorio, 47 pruebas)

Total de `src/` de la app: **líneas 77,0 % (2.277/2.959) · funciones 48,1 % (484/1.007) · ramas 63,5 % (2.033/3.200)**.
Los umbrales se fijaron un poco por debajo de esa medición real; no se inflaron ni se excluyeron archivos para subirla.

Archivos clave:

| Archivo | Líneas | Funciones | Ramas |
|---|---|---|---|
| `ClientWorkspace.jsx` | 91,0 % | 37,9 % | 62,6 % |
| `CajaCredito.jsx` (Caja, Cartera, Separados) | 81,2 % | 60,9 % | 73,7 % |
| `DocumentosComerciales.jsx` (Cotizaciones, Garantías, Proveedores) | 61,8 % | 57,6 % | 71,4 % |
| `PlatformApp.jsx` (ingreso, perfil, 2FA) | 87,5 % | 48,2 % | 71,3 % |
| `OwnerWorkspace.jsx` | 89,6 % | 42,2 % | 46,9 % |
| `AdminTools.jsx` | 85,6 % | 29,8 % | 55,0 % |
| `RecoveryDialog.jsx` | 68,6 % | 57,1 % | 40,9 % |
| `ErrorBoundary.jsx` | 93,3 % | 71,4 % | 69,2 % |

## Cómo leer las cifras (límites honestos)

- **Las líneas sobrestiman.** El código de `src/` escribe muchas sentencias por línea (un manejador entero en una
  línea). Una línea cuenta como cubierta aunque una parte no se ejecute. Las **funciones** (muchas son manejadores
  `onClick`/`onChange` de una sola vez) y las **ramas** (bloques V8) no dependen del formato y son la cifra más
  exigente: de ahí que funciones esté en 48 %.
- Un archivo de la app que ningún spec carga entra al total como 0 % de sus líneas. Hoy: `LegalDocuments.jsx`
  (contrato, términos y privacidad; ningún spec abre «Leer contrato…»).
- Fuera del conteo por no ser la app del navegador de producción (lista `NO_BROWSER` en el script):
  `lazy-views.ssr.jsx` (SSR de Node), la demo estática (`platform-demo*.mjs/jsx`, `demo-*.mjs`, `je-trial-*`;
  la cubre `test:demo:ui`) y `landing.mjs`.
- Solo se mide la **página principal** de cada prueba (no las pestañas o contextos extra que abren pocas pruebas,
  p. ej. el propietario en un segundo navegador) y solo el proyecto de escritorio; los de celular ejercen las mismas
  rutas con otro diseño.
- Quedan sin cubrir por E2E (se ve en la tabla): impresión/PDF de comprobantes (`voucher-ticket.mjs`), lector de
  códigos con cámara (`BarcodeScanner.jsx`), ajustes del catálogo público (`CatalogSettings.jsx`), proveedores y
  órdenes de compra (`PurchasingView`), panel de suscripción y renovación, documentos legales y la mayoría de las
  funciones pequeñas de `AdminTools.jsx` (30 %).
- Las pruebas SSR de `tests/*-ui.test.mjs` siguen existiendo pero **no** suman a ninguna de las dos cifras.

## CI

El job `ui-coverage` de `.github/workflows/scorta-ci.yml` ejecuta `npm run test:coverage:ui` en pushes y ejecuciones
manuales (no en PR), con `continue-on-error: true`: informa y sube `summary.json` y `lcov.info`, pero no bloquea la
fusión. Cuesta unos 4–5 minutos extra porque repite el proyecto de escritorio con la compilación sin minificar.
Cuando la cifra se estabilice y quieras que bloquee, quita `continue-on-error` y sube los umbrales de
`browser-checks/coverage-ui.mjs` (`THRESHOLDS`).

## E2E añadidos en este punto (`browser-checks/`)

Todos corren en escritorio, celular (390 px) y celular estrecho (360 px) y comprueban el estado real por la API.
Los de vendedor verifican que teléfono y documento llegan **enmascarados** (`•••8990`) y que el número completo no
aparece en pantalla ni en los enlaces de WhatsApp.

| Spec | Cubre |
|---|---|
| `credito.spec.mjs` | Cupo desde Cartera, venta a crédito con ficha, abono mayor al saldo rechazado, abono parcial (AB-0001), estado de cuenta, «Pagar todo el saldo»; vendedor: dentro del cupo sí, sobre el cupo no, sin «Asignar cupo». |
| `separados.spec.mjs` | Nuevo separado con abono inicial (stock reservado), abonos, «Pagar y entregar» (venta del día), cancelación con saldo a favor y regreso al inventario; vendedor sin «Cancelar». |
| `garantias.spec.mjs` | Recepción, decisión (cambio, devolución, rechazo), envío/aprobación/cierre con proveedor y reposición, reporte; unidades reclamables; vendedor sin acciones de administrador. |
| `cotizaciones.spec.mjs` | Guardar desde Nueva venta (sin tocar stock), convertir en venta, cambio de precio (exige aceptar), falta de stock, anular; vendedor: WhatsApp sin número completo. |
| `dos-pasos.spec.mjs` | 2FA del propietario: activar desde «Mi perfil» con código TOTP, ingreso con código, código malo y repetido rechazados, desactivar. Deja siempre la cuenta sin 2FA. |
| `recuperacion.spec.mjs` | Verificar el correo con el código recibido, «¿Olvidaste tu contraseña?» (respuesta idéntica si la cuenta no existe), enlace de un solo uso, contraseña vieja rechazada y nueva aceptada. |

Correo en las pruebas: `browser-checks/serve.mjs` levanta un buzón local (puerto de la app + 1000) y se lo pasa al
servidor como `SCORTA_MAIL_WEBHOOK_URL`; `fixtures.mjs` expone `mails()`/`clearMails()`. Nada sale a internet.
