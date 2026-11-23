# Seguridad de SCORTA

Actualizado: 21 de noviembre de 2026. Describe la plataforma multiempresa (`/api/v2`) tal como está en el código hoy. Lo que aún falta está en la sección [Pendientes](#pendientes).

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
- Recuperación por correo (SEG-13): solo a correos verificados con código de 6 dígitos; enlace `/recuperar#<token>` de un solo uso que vence en 30 minutos, guardado solo como hash; respuesta idéntica exista o no la cuenta; límites por IP y por cuenta; al usarlo se cierran todas las sesiones. Sin proveedor de correo configurado queda apagada y el propietario o el administrador restablecen la contraseña desde su panel.

## Sesiones

| Cuenta | Duración máxima |
|---|---|
| Administrador y vendedor | **30 días** desde el login |
| Propietario | **12 horas** |
| Modo soporte del propietario | **2 horas**; se cierra solo |

- El navegador recibe solo una cookie `HttpOnly`, `SameSite=Strict` y `Secure` (en producción). No se guarda nada en `localStorage`.
- El identificador de sesión es aleatorio de 256 bits y en la base solo se guarda su hash.
- Las sesiones **sobreviven** a reinicios y deploys. Se cierran al salir, al cambiar o restablecer la contraseña, al desactivar la cuenta o la empresa, y al restaurar un respaldo (la restauración borra todas las sesiones).

## Modo soporte del propietario

- Para entrar a una empresa, el propietario escribe un **motivo** obligatorio.
- El inicio y el fin quedan en la auditoría de esa empresa, con la identidad del propietario y el motivo.
- Termina solo a las 2 horas.
- Falta un aviso visible para el almacén mientras el propietario está dentro (SEG-09).

## Verificación en dos pasos (2FA) del propietario

**En curso (SEG-01).** Como la cuenta del propietario controla todas las empresas, tendrá un segundo factor. Mientras tanto: contraseña larga y única, sesión de 12 horas y 2FA activado en Render, Cloudflare, GitHub, R2 y el correo (US-09).

## Límite de intentos e IP real

- **Por cuenta:** 10 intentos fallidos con la misma empresa, usuario y dirección IP bloquean esa combinación **15 minutos**.
- **Por dirección IP:** máximo 60 intentos de login por minuto desde la misma IP.
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

El enlace del comprobante que se envía por WhatsApp es opaco y vence a los 7 días; se puede renovar desde la venta. Pendiente (SEG-03): enmascarar el teléfono, poder revocar el enlace y no guardar el token en claro.

## Datos y respaldos

- Todos los datos están en `platform.sqlite`, en el disco de Render.
- El respaldo externo va **cifrado** (AES-256-GCM) con `SCORTA_BACKUP_KEY` y se sube con una llave de solo escritura. Ver [OPERACION.md](OPERACION.md#3-respaldos).
- Los secretos y su rotación están en [SECRETOS.md](SECRETOS.md).

## Pendientes

| ID | Tema |
|---|---|
| SEG-01 | 2FA del propietario (en curso) |
| SEG-03 | Comprobante público: enmascarar teléfono, revocar enlace, token con hash |
| SEG-06 | Mismo tiempo de respuesta para usuarios inexistentes |
| SEG-07 | Límite de intentos en «cambiar contraseña» |
| SEG-08 | Obligar a cambiar la contraseña tras un restablecimiento |
| SEG-09 | Aviso visible cuando el propietario está en modo soporte |
| BE-12 | Revocar todas las sesiones de una empresa o de la plataforma |
| SEG-10 / SEG-11 | Revisión interna antes del 2.º cliente y prueba de intrusión antes de 10 |

## Servidor heredado (`/api`)

El modo antiguo «motoshop» (`/api/login`, `auth.mjs`, `motoshop.sqlite`) usa sesiones en memoria de 8 horas que se pierden al reiniciar. La plataforma no lo usa y se retirará (BE-38). No crees cuentas nuevas en él.

## Pruebas

`npm test` incluye, entre otras, `tests/auth.test.mjs`, `tests/audit-api-security.test.mjs`, `tests/platform-hardening.test.mjs` y `tests/correcciones-2026-11-20.test.mjs`, que cubren sesiones, permisos, origen, límite de intentos, cabeceras y aislamiento entre empresas.
