# Registro de actividades de tratamiento de datos — SCORTA

**BORRADOR — debe revisarlo un abogado colombiano (US-21).** Los plazos de retención son una **propuesta**: el dueño debe fijarlos con el abogado y el contador (US-27).

Actualizado: 21 de noviembre de 2026.

## Datos generales

| Campo | Valor |
|---|---|
| Nombre del servicio | SCORTA |
| Quien presta el servicio | `[nombre o razón social del dueño / SAS (US-24)]`, NIT `[__________]` |
| Contacto para datos personales | `[correo]` · `[WhatsApp]` · `[dirección]` |
| Persona responsable interna | `[nombre del dueño]` |
| Dónde se almacenan los datos | Servidor de **Render en EE. UU.** (región `[Ohio / Virginia]`, US-06); respaldos cifrados en **Cloudflare R2** (`[ubicación del bucket]`). Ver [SUBENCARGADOS.md](SUBENCARGADOS.md). |
| ¿Inscripción en el RNBD? | **Por consultar con el abogado (US-18).** |

## Papel de SCORTA en cada base

- **Responsable:** datos de los almacenes clientes y de sus usuarios (cuentas de acceso), prospectos y contactos comerciales.
- **Encargado:** datos de los **clientes finales** de cada almacén (nombre, teléfono, placa) y los datos operativos del almacén. El responsable es cada almacén.

## Actividades de tratamiento

| # | Base / actividad | Titulares | Datos | Finalidad | Base legal (a validar) | Papel de SCORTA | Retención propuesta | Quién accede | Dónde se almacena |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Empresas clientes** | Almacenes y su representante o contacto | Nombre del negocio, NIT, dirección, WhatsApp, correo, persona de contacto, logo, mensualidad, fechas de contrato | Prestar y cobrar el servicio, contactar por soporte y renovaciones | Ejecución del contrato; autorización del contacto | Responsable | Duración del contrato + `[plazo contable/legal — confirmar con contador y abogado]` | Dueño (propietario de la plataforma) | Render (EE. UU.) + respaldos R2 |
| 2 | **Pagos y renovaciones** | Almacenes | Importe, fecha, período, quién registró | Control de cobro y vigencia | Ejecución del contrato; obligaciones contables | Responsable | `[plazo contable — confirmar con contador]` | Dueño | Render + R2 |
| 3 | **Usuarios** de cada almacén | Administradores y vendedores | Nombre, usuario, correo (opcional), rol, hash de contraseña, fecha del último cambio de contraseña | Dar acceso seguro y controlar permisos | Ejecución del contrato; autorización | Responsable (acceso) / encargado (uso laboral por el almacén) | Mientras la cuenta esté activa; borrar al eliminar la empresa | Dueño; administrador de su empresa (ve sus usuarios) | Render + R2 |
| 4 | **Sesiones y seguridad** | Usuarios | Hash del identificador de sesión, vencimiento; hash de empresa+usuario+IP en intentos fallidos | Seguridad del acceso y límite de intentos | Interés legítimo en la seguridad (validar) | Responsable | Sesión: hasta 30 días (12 h propietario). Intentos: 15 minutos | Nadie en forma directa (automático) | Render |
| 5 | **Auditoría** | Usuarios y propietario | Quién hizo qué acción, cuándo, motivo (incluye entradas del propietario en modo soporte) | Trazabilidad, seguridad y resolución de disputas | Interés legítimo; obligación de seguridad | Encargado (auditoría del almacén) / responsable (auditoría de plataforma) | `[propuesta: 2 años — confirmar]` (US-27, DM-07) | Administrador de la empresa; dueño | Render + R2 |
| 6 | **Clientes finales** de cada almacén | Personas que compran en el almacén | Nombre (opcional), teléfono (opcional), placa de la moto, historial de compras y servicios | Registrar la venta, el comprobante, el historial de la moto y contactar al cliente | **La define el almacén** (autorización del cliente, BE-05) | **Encargado** | La que ordene el almacén; al terminar el contrato, entrega y borrado (sección «Fin del contrato») | Administrador del almacén; vendedor (solo los clientes de sus ventas); dueño solo en modo soporte con motivo | Render + R2 |
| 7 | **Comprobantes públicos** | Clientes finales | Enlace con nombre, teléfono y placa de la venta | Enviar el comprobante por WhatsApp | La del almacén | Encargado | El enlace vence a los 7 días | Quien tenga el enlace | Render |
| 8 | **Mecánicos** | Mecánicos del almacén | Nombre, porcentaje de mano de obra, trabajos realizados | Calcular el reparto de mano de obra | La define el almacén | Encargado | La que ordene el almacén | Administrador del almacén | Render + R2 |
| 9 | **Operación del almacén** (inventario, compras, ventas, cierres, fotos de productos) | No son datos personales en sí, salvo el usuario que registró y el proveedor si es persona natural | Productos, costos, proveedores, ventas, cierres de caja | Prestar el servicio | Ejecución del contrato | Encargado | Duración del contrato; luego entrega y borrado | Administrador; vendedor (parcial, sin costos) | Render + R2 |
| 10 | **Tickets de soporte** | Usuarios | Mensajes, nombre, fecha | Atender solicitudes | Ejecución del contrato | Responsable | `[propuesta: 1 año después de cerrado — confirmar]` | Usuario que lo creó; dueño | Render + R2 |
| 11 | **Registros técnicos (logs)** | Usuarios y visitantes | Método, ruta, código de respuesta y duración. **Sin IP** salvo diagnóstico temporal (`SCORTA_LOG_IP_HEADERS`) | Operar y diagnosticar el servicio | Interés legítimo (validar) | Responsable | Lo que guarde Render (pocos días); externo `[por definir, OPS-07]` | Dueño | Render (EE. UU.) |
| 12 | **Respaldos** | Todos los anteriores | Copia completa cifrada de la base | Recuperar el servicio ante fallas | Obligación de seguridad | Responsable / encargado | **30 días** (se borran solos) | Dueño (con la llave de cifrado) | Cloudflare R2 |
| 13 | **Prospectos y ventas** de SCORTA | Dueños y encargados de almacenes contactados | Nombre, almacén, teléfono, notas de seguimiento | Ofrecer el servicio | Autorización del prospecto | Responsable | `[propuesta: 1 año sin contacto — confirmar]` | Dueño | `[hoja de cálculo del dueño — indicar dónde]` |
| 14 | **Demo pública** | — | Solo datos ficticios en el navegador del visitante. Excepción: nombre y WhatsApp de JE, con su consentimiento escrito (US-26) | Mostrar el producto | Consentimiento de JE | Responsable | Mientras JE lo autorice | Público | Navegador del visitante |

## Medidas de seguridad (resumen)

Cifrado HTTPS; contraseñas con hash; cookies seguras; permisos por rol verificados en el servidor; aislamiento entre empresas; respaldos cifrados con llave fuera del proveedor; 2FA en las cuentas de infraestructura; auditoría de acciones y del modo soporte. Detalle en `SCORTA/docs/seguridad.md` y `SCORTA/docs/SECRETOS.md`.

## Fin del contrato (propuesta)

1. El almacén pide su exportación (`company.export` / «Exportar datos del negocio»).
2. SCORTA la entrega en `[N]` días hábiles.
3. SCORTA inhabilita y luego elimina la empresa a los `[N]` días de terminado el contrato.
4. Los respaldos que la contienen se borran solos a los 30 días.
5. SCORTA confirma el borrado por escrito.

Plazos a fijar en el contrato. **Confirmar con abogado.**

## Pendientes para el abogado

- Validar la base legal de cada actividad.
- Transferencia internacional a EE. UU. (Render, Cloudflare, GitHub) (US-17).
- Inscripción en el RNBD (US-18).
- Plazos de retención contables y legales (US-27).
- Si la placa de una moto se considera dato personal y cómo se trata al anonimizar.
