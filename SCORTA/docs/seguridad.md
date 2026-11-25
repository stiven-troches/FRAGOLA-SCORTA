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
| SEG-10 / SEG-11 | Revisión interna antes del 2.º cliente y prueba de intrusión antes de 10 |
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

El modo antiguo «motoshop» (`/api/login`, `auth.mjs`, `motoshop.sqlite`) usa sesiones en memoria de 8 horas que se pierden al reiniciar. La plataforma no lo usa y se retirará (BE-38). No crees cuentas nuevas en él.

## Pruebas

`npm test` incluye, entre otras, `tests/auth.test.mjs`, `tests/audit-api-security.test.mjs`, `tests/platform-hardening.test.mjs` y `tests/correcciones-2026-11-20.test.mjs`, que cubren sesiones, permisos, origen, límite de intentos, cabeceras y aislamiento entre empresas.
