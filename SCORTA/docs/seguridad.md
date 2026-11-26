# Seguridad de SCORTA

Actualizado: 25 de noviembre de 2026. Describe la plataforma multiempresa (`/api/v2`) tal como está en el código hoy. Lo que aún falta está en la sección [Pendientes](#pendientes).

Relacionados: [OPERACION.md](OPERACION.md) · [INCIDENTES-SEGURIDAD.md](INCIDENTES-SEGURIDAD.md) · [SECRETOS.md](SECRETOS.md)

## Cuentas y roles

| Rol | Qué puede hacer |
|---|---|
| **Propietario** (dueño de SCORTA) | Crea empresas y cuentas, registra pagos, atiende tickets. No ve los datos de un almacén salvo que entre en **modo soporte**. |
| **Administrador** (del almacén) | Todo lo de su empresa: productos, compras, ventas, devoluciones, taller, reportes y cierres. No crea cuentas. |
| **Vendedor** | Nueva venta, Inventario y Taller. Solo ve sus propias ventas y los clientes de esas ventas. No ve costos ni compras. |

La empresa de cada petición **sale siempre de la cuenta en el servidor**, nunca de lo que envíe el navegador. Los permisos se revisan de nuevo en cada petición.

## Contraseñas

- Entre 8 y 200 caracteres, con número, mayúscula, minúscula y símbolo.
- Se guardan con hash PBKDF2-SHA256 (120.000 iteraciones) y sal. El refuerzo a un hash más fuerte espera tu decisión (US-41).
- Cambiar o restablecer una contraseña cierra todas las sesiones de esa cuenta.
- **Cambio obligatorio tras un restablecimiento (SEG-08):** cuando el propietario o el administrador restablece la contraseña de otra cuenta, esa cuenta queda marcada y, al ingresar, solo puede ver su sesión, cambiar la contraseña o salir hasta que elija una nueva.
- **Límite en «cambiar contraseña» (SEG-07):** 5 contraseñas actuales incorrectas por usuario en 15 minutos devuelven `429` hasta que pase la ventana.
- Recuperación por correo (SEG-13): solo a correos verificados con código de 6 dígitos; enlace `/recuperar#<token>` de un solo uso que vence en 1 hora, guardado solo como hash; respuesta idéntica exista o no la cuenta; límites por IP y por cuenta; al usarlo se cierran todas las sesiones. Sin proveedor de correo configurado queda apagada y el propietario o el administrador restablecen la contraseña desde su panel.

## Sesiones

| Cuenta | Duración máxima |
|---|---|
| Administrador y vendedor | **30 días** desde el login |
| Propietario | **12 horas** |
| Modo soporte del propietario | **2 horas**; se cierra solo |

- El navegador recibe solo una cookie `HttpOnly`, `SameSite=Strict` y `Secure` (en producción). No se guarda nada en `localStorage`.
- El identificador de sesión es aleatorio de 256 bits y en la base solo se guarda su hash.
- Las sesiones **sobreviven** a reinicios y deploys. Se cierran al salir, al cambiar o restablecer la contraseña, al desactivar la cuenta o la empresa, y al restaurar un respaldo (la restauración borra todas las sesiones).
- **Cierre masivo (BE-12):** desde su panel el propietario puede cerrar todas las sesiones de una empresa (incluido el modo soporte abierto en ella) o de toda la plataforma (acción `sessions.revoke`). Su propia sesión se conserva y la acción queda en la auditoría con el número de sesiones cerradas.

## Modo soporte del propietario

- Para entrar a una empresa, el propietario escribe un **motivo** obligatorio.
- El inicio y el fin quedan en la auditoría de esa empresa, con la identidad del propietario y el motivo.
- Termina solo a las 2 horas.
- **Aviso visible (SEG-09):** mientras el propietario está dentro, los usuarios de esa empresa ven el aviso «El soporte de SCORTA está trabajando en tu cuenta», con el motivo y la hora de inicio.

## Verificación en dos pasos (2FA) del propietario

**Implementado y obligatorio en producción (SEG-01).** El propietario controla todas las empresas, así que con `NODE_ENV=production` el servidor bloquea cualquier operación suya (`403 TWO_FACTOR_SETUP_REQUIRED`) hasta que active la verificación en dos pasos con una aplicación autenticadora (TOTP RFC 6238, 6 dígitos, 30 s, sin reutilizar códigos). Después, cada ingreso exige el código. `SCORTA_REQUIRE_OWNER_2FA=0` la vuelve opcional (no recomendado); `=1` la exige también fuera de producción. Si el propietario pierde el celular, hay que retirar `totp` de su usuario con acceso directo a la base (Render Shell) y volver a activarla. Mantén además 2FA en Render, Cloudflare, GitHub, R2 y el correo (US-09).

## Límite de intentos e IP real

- **Por cuenta:** 10 intentos fallidos con la misma empresa, usuario y dirección IP bloquean esa combinación **15 minutos**.
- **Por dirección IP:** máximo 60 intentos de login por minuto desde la misma IP.
- **Mismo trabajo para usuarios inexistentes (SEG-06):** si la cuenta no existe, el servidor igual verifica la contraseña contra un hash de relleno; la respuesta tarda lo mismo y el mensaje es idéntico («Empresa, usuario o contraseña incorrectos»).
- La IP real se toma de la cabecera definida en `SCORTA_CLIENT_IP_HEADER` (`cf-connecting-ip` con Cloudflare, `x-forwarded-for` en Render). Con `x-forwarded-for` se cuenta desde la derecha según `SCORTA_TRUSTED_PROXY_HOPS`, porque la parte izquierda la puede falsificar el cliente.
- Si la variable está vacía, se usa la IP de la conexión. Detrás de un proxy esa IP es la del proxy, y el límite se volvería un bloqueo para todos. Por eso hay que configurarla en Render (ver [OPERACION.md](OPERACION.md#ip-real-del-cliente-límite-de-intentos)).

## Protección de las peticiones

- **CSRF:** las peticiones que cambian datos deben ser JSON y traer un `Origin` igual a `SCORTA_PUBLIC_URL`.
- **Tamaño:** máximo 8 KB en el login y 2 MB en las demás.
- **Errores:** los errores 500 no muestran detalles internos al navegador; el detalle va al log.
- **Logs:** una línea JSON por petición a la API. Los enlaces de comprobante aparecen enmascarados (`/receipt/[token]`). No se registran cookies ni contraseñas.

## Cabeceras de seguridad

| Cabecera | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` |
| `Strict-Transport-Security` (HSTS) | `max-age=31536000` (solo en producción) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Cache-Control` | `no-store` |

La CSP no permite scripts en línea ni de otros dominios.

## Comprobantes públicos

El enlace del comprobante que se envía por WhatsApp es opaco y vence a los 7 días; se puede renovar desde la venta. Además (SEG-03):

- En la base solo se guarda el **hash SHA-256** del token; el enlace en claro existe solo en la respuesta que lo genera. Los tokens antiguos guardados en claro se borran con una migración única.
- La página pública muestra el **teléfono enmascarado** (solo los 4 últimos dígitos), igual que el número de documento.
- Desde el detalle de la venta se puede **revocar** el enlace; quien lo tenga ya no podrá abrirlo. Generar uno nuevo invalida el anterior.

## Datos y respaldos

- Todos los datos están en `platform.sqlite`, en el disco de Render.
- El respaldo externo va **cifrado** (AES-256-GCM) con `SCORTA_BACKUP_KEY` y se sube con una llave de solo escritura. Ver [OPERACION.md](OPERACION.md#3-respaldos).
- Los secretos y su rotación están en [SECRETOS.md](SECRETOS.md).

## Pendientes

| ID | Tema |
|---|---|
| SEG-11 | Prueba de intrusión externa antes de 10 clientes (SEG-10, la revisión interna, ya se hizo: ver al final) |
| US-41 | Reforzar el hash de contraseñas (hoy PBKDF2-SHA256 con 120.000 iteraciones); espera tu decisión |

### Ya implementados (antes figuraban aquí)

| ID | Tema | Dónde está |
|---|---|---|
| SEG-01 | 2FA del propietario, obligatorio en producción | `platform.mjs`: login con TOTP y bloqueo `TWO_FACTOR_SETUP_REQUIRED` |
| SEG-03 | Comprobante público: token con hash, teléfono enmascarado, enlace revocable | `platform.mjs`: `issueReceipt`, `publicReceiptSale`, acción `sale.receipt.revoke` |
| SEG-06 | Mismo trabajo y mensaje para usuarios inexistentes | `platform.mjs`: `dummyUser` en el login |
| SEG-07 | Límite de intentos en «cambiar contraseña» | `platform.mjs`: `POST /api/v2/password` |
| SEG-08 | Cambio obligatorio de contraseña tras un restablecimiento | `platform.mjs`: `mustChangePassword` |
| SEG-09 | Aviso visible cuando el propietario está en modo soporte | `platform.mjs` (`activeSupport`) y `src/ClientWorkspace.jsx` |
| BE-12 | Cerrar todas las sesiones de una empresa o de la plataforma | `platform.mjs` (`sessions.revoke`) y `src/OwnerWorkspace.jsx` |

## Servidor heredado (`/api`)

El modo antiguo «motoshop» (`/api/login`, `auth.mjs`) fue retirado (BE-38): ya no hay rutas ni inicio de sesión propios, y cualquier `/api/*` fuera de `/api/v2/*` responde 403. Si `motoshop.sqlite` existe al preparar una plataforma nueva, solo se lee una vez, sin modificarla.

## Pruebas

`npm test` incluye, entre otras, `tests/auth.test.mjs`, `tests/audit-api-security.test.mjs`, `tests/platform-hardening.test.mjs` y `tests/correcciones-2026-11-20.test.mjs`, que cubren sesiones, permisos, origen, límite de intentos, cabeceras y aislamiento entre empresas.

## Revisión interna 2026-11-25 (SEG-10)

**Alcance**: imágenes fuera de la base (`/media`, R2/disco, migración), búsqueda paginada (`/api/v2/search/*`), versión del sobre con `ETag`/304, exportación de datos de una empresa (`customer.export`), estado del servidor del propietario (`/api/v2/owner/server-status`), alertas por correo, retiro del servidor heredado (`/api`) y protección CSRF (origen + JSON + `SameSite=Strict`).

**Resultado**: sin hallazgos de severidad alta. Seis puntos, todos corregidos (pruebas en `tests/seg10-revision.test.mjs`):

| # | Severidad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | Media | `GET /media/...` sin tope por origen; cada petición anónima recorría el catálogo, leía el archivo y calculaba su sha256 (o pedía a R2). | Mismo tope por origen que las lecturas del catálogo (600/min, 429 + `Retry-After`); un `If-None-Match` coincidente responde 304 sin leer el archivo; en disco la huella se verifica una vez por archivo (tamaño + fecha). |
| 2 | Baja | Imágenes públicas con `max-age=31536000, immutable`, aunque dejan de ser públicas al archivar/agotar el producto, apagar el catálogo o eliminar la empresa. | Públicas `public, max-age=3600`; privadas `private, no-cache` (revalidan con `ETag`). |
| 3 | Baja | Alertas limitadas a un correo por tipo y hora: un ataque señuelo contra una empresa inventada silenciaba la alerta de un ataque real; el texto del atacante (empresa/usuario, dominios sin `http`) llegaba al correo. | Un correo por tipo + empresa/cuenta real cada hora y máximo 10 por hora en total; empresa o usuario inexistentes se muestran como «(empresa inexistente)» / «(usuario inexistente)»; `scrub` quita también dominios sueltos. |
| 4 | Baja (disponibilidad) | La subida de imágenes a R2 ocurría dentro de la cola de escrituras con 120 s de espera, y cada escritura reintentaba en serie todas las imágenes pendientes de todas las empresas. | Espera de 10 s por subida (configurable); cada escritura sube solo sus imágenes; las pendientes se reintentan en segundo plano (fuera de la cola) y al arrancar. Si la subida falla, la escritura se guarda con el data URL. |
| 5 | Informativa | `/media` respondía 401 sin sesión para una imagen privada existente y 404 para una inexistente (permitía saber si existe). | 404 en ambos casos. |
| 6 | Error | `/api/v2/search/products` devolvía la referencia interna de la foto (`{mediaId,companyId,type,bytes}`) en vez de la URL. | La búsqueda devuelve la URL `/media/...`, igual que el sobre. |

**Queda para la prueba de intrusión externa (SEG-11)**: pruebas de caja negra sobre la instancia publicada (Render + Cloudflare): fuerza bruta y límites detrás del proxy real, aislamiento entre empresas con cuentas reales, cabeceras y TLS, carga de imágenes maliciosas, abuso del catálogo y del checkout públicos, y revisión de la configuración de R2, correo y respaldos externos.
