# Procedimiento de habeas data (consultas y reclamos de datos personales)

Actualizado: 21 de noviembre de 2026 · **Lo valida el abogado (US-21)**

Este procedimiento explica cómo SCORTA atiende a una persona que quiere **saber, corregir, actualizar o borrar** sus datos, o **revocar** su autorización (Ley 1581 de 2012 y sus decretos reglamentarios).

## 1. ¿Quién responde? Primero identifica el caso

| Si la persona es… | Responsable de sus datos | Qué hace SCORTA |
|---|---|---|
| **Cliente final de un almacén** (nombre, teléfono, placa en una venta) | **El almacén** | SCORTA es **encargado**. Reenvía la solicitud al almacén (sección 5) y ejecuta en la app lo que el almacén ordene. |
| **Usuario** de un almacén (administrador o vendedor) | SCORTA para sus datos de acceso; el almacén para su uso laboral | SCORTA responde directamente y avisa al almacén. |
| **Representante o contacto** de un almacén cliente o prospecto | **SCORTA** | SCORTA responde directamente. |

Si hay duda, trata la solicitud como propia, responde a la persona que la recibiste y consulta al abogado.

## 2. Canal

- **Correo:** `[correo de datos personales — por definir, p. ej. datos@dominio]`
- **WhatsApp de soporte:** `[número — por definir, US-39]` (si llega por aquí, pide que la envíe por correo o llena tú el formulario con ella y guarda el chat).
- **Dirección física:** `[dirección de notificaciones — por definir]`

Estos datos deben aparecer en la política de datos y en el aviso de privacidad.

## 3. Responsable interno

| Rol | Persona | Qué hace |
|---|---|---|
| Responsable de atender solicitudes | `[nombre del dueño]` | Recibe, registra, ejecuta en la app y responde |
| Apoyo legal | `[nombre del abogado]` | Revisa casos dudosos, negativas y reclamos ante la SIC |

## 4. Formulario de solicitud

Copia este texto en un formulario (Google Forms o similar) o envíalo por correo.

> **Solicitud de datos personales — SCORTA**
>
> 1. Nombre completo:
> 2. Tipo y número de documento:
> 3. Correo o teléfono para la respuesta:
> 4. ¿En qué almacén compró o con qué empresa tiene relación? (si aplica):
> 5. Qué solicita (marque una):
>    ☐ Saber qué datos míos tienen (consulta)
>    ☐ Corregir o actualizar mis datos
>    ☐ Borrar mis datos / revocar la autorización
>    ☐ Prueba de la autorización que di
>    ☐ Otro reclamo: ________
> 6. Detalle (qué dato, qué corrección; si es un cliente final, su teléfono o placa para ubicarlo):
> 7. Adjunte copia de su documento de identidad (o del poder, si actúa por otra persona).
>
> Fecha: ________ Firma o aceptación: ________

**Verifica la identidad** antes de entregar o cambiar datos: el documento debe coincidir con el nombre registrado, o la persona debe escribir desde el teléfono o correo registrado.

## 5. Pasos

1. **Recibir y registrar** en el registro de solicitudes (sección 7) el mismo día. Asigna un número `HD-AAAA-NNN`.
2. **Acusar recibo** a la persona: «Recibimos tu solicitud HD-AAAA-NNN el [fecha]. Te responderemos a más tardar el [fecha límite]».
3. **Identificar al responsable** (sección 1).
4. **Si el responsable es el almacén**, reenvíale la solicitud **dentro de `[N]` días hábiles** (plazo a fijar en el contrato; confirmar con abogado) con este mensaje:

   > Hola, [representante del almacén]. Recibimos una solicitud de datos personales de una persona que dice ser cliente de tu almacén. Número: HD-AAAA-NNN. Solicita: [tipo]. Datos para ubicarla: [teléfono/placa]. Como responsable de esos datos, por favor indícanos por escrito si aprobamos la solicitud y qué debemos hacer. El plazo para responder a la persona vence el [fecha]. Adjuntamos la solicitud.

   Informa a la persona que su solicitud se envió al almacén, que es el responsable.
5. **Ejecutar en la app** (sección 6) lo que corresponda, solo con la orden del responsable.
6. **Responder por escrito** a la persona dentro del plazo, con lo que se hizo.
7. **Cerrar** el registro con fecha y evidencia (capturas, correos).

## 6. Cómo se ejecuta en la app

Las funciones `customer.update`, `customer.erase` y `company.export` **están en desarrollo** (BE-08, BE-09). Cuando estén listas, confirma aquí el nombre exacto de los botones.

| Solicitud | Acción en SCORTA | Quién la ejecuta |
|---|---|---|
| **Consulta** (qué datos hay) | El administrador del almacén busca al cliente en «Nueva venta → Más opciones → Buscar cliente o placa» y exporta o copia lo que aparece. | El almacén (o el propietario en modo soporte con su autorización) |
| **Corregir o actualizar** | `customer.update`: cambia nombre o teléfono del cliente. Queda en la auditoría. | El almacén o el propietario en modo soporte |
| **Borrar / anonimizar** | `customer.erase`: reemplaza nombre y teléfono del cliente por un valor anónimo en todas sus ventas. Las ventas y montos se conservan por obligaciones contables (confirmar con abogado y contador si la placa también debe anonimizarse). | El propietario en modo soporte, con la orden escrita del almacén |
| **Entrega de datos al terminar el contrato** | `company.export`: archivo completo de la empresa. Hoy existe «Inventario → Opciones → Exportar datos del negocio» para el administrador. | El propietario |
| **Borrado al terminar el contrato** | «Eliminar empresa» en el panel del propietario, después de entregar la exportación. Los respaldos cifrados vencen solos a los 30 días. | El propietario |

**Modo soporte:** al entrar, escribe como motivo el número de la solicitud, p. ej. «Habeas data HD-2026-001, orden del almacén del 21/11». Queda en la auditoría.

## 7. Registro de solicitudes

Lleva una hoja de cálculo privada con estas columnas. Conserva el registro y las evidencias por `[plazo a definir con el abogado]`.

| N.º | Fecha de recibo | Canal | Nombre del titular | Documento verificado (sí/no) | Tipo (consulta/corrección/borrado/revocación/reclamo) | Almacén relacionado | ¿Responsable? (almacén/SCORTA) | Fecha reenvío al almacén | Orden del almacén (fecha) | Acción en la app | Fecha límite | Fecha de respuesta | Estado | Observaciones |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## 8. Plazos — **confirmar con abogado**

| Tipo | Plazo de referencia para responder | Prórroga | Estado |
|---|---|---|---|
| Consulta | 10 días hábiles desde el recibo | Posible, avisando antes de vencer | **Confirmar con abogado** |
| Reclamo (corrección, borrado, revocación) | 15 días hábiles desde el recibo completo | Posible, avisando antes de vencer | **Confirmar con abogado** |
| Reclamo incompleto | Pedir lo que falta; plazo para que la persona complete | — | **Confirmar con abogado** |
| Reenvío al almacén (encargado → responsable) | `[N]` días hábiles | — | Fijar en el contrato |
| Leyenda «reclamo en trámite» en la base | Mientras se resuelve | — | **Confirmar con abogado** si aplica y cómo marcarla |

Calcula la fecha límite el mismo día que registras la solicitud y anótala.

## 9. Cuando no se puede borrar

Algunos datos deben conservarse por obligaciones legales o contables (por ejemplo, las ventas). En ese caso se **anonimiza** al cliente y se explica a la persona qué se conservó y por qué. El abogado debe validar esa respuesta.
