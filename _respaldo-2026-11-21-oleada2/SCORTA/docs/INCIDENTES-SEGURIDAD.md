# Plan de respuesta a incidentes de seguridad

Una página para actuar rápido. Aplica cuando alguien pudo **ver, cambiar o llevarse datos sin permiso**: cuenta robada, llave o contraseña filtrada, acceso de una empresa a datos de otra, respaldo expuesto, equipo del dueño perdido. Para caídas y fallas técnicas usa el runbook de [OPERACION.md](OPERACION.md#7-runbook-de-incidentes).

**Responsable:** el dueño de SCORTA. **Apoyo:** abogado (avisos legales) y el agente o técnico de seguridad.

## 1. Detectar (minuto 0)

Señales: alerta de login del propietario desde otro lugar, muchos intentos fallidos en el log, un almacén reporta datos que no son suyos, un secreto aparece en GitHub o en un chat, aviso de Render/Cloudflare/GitHub, cambios en la auditoría que nadie reconoce.

Abre el **registro del incidente** (una nota con fecha) y escribe: hora, quién avisó, qué se vio. Desde aquí, anota cada acción con su hora.

## 2. Contener (primera hora)

1. **Cierra las sesiones.**
   - Una cuenta: restablece su contraseña desde el panel del propietario (cierra sus sesiones) o desactívala.
   - Una empresa: inhabilítala desde el panel del propietario.
   - Toda la plataforma: activa `SCORTA_MAINTENANCE=1` en Render. Al volver, restaurar o rotar sesiones obliga a todos a entrar de nuevo. (BE-12 añadirá «revocar todas las sesiones» con un clic).
2. **Si el atacante pudo tener el propietario:** cambia su contraseña y la del correo, revisa 2FA, y revisa la auditoría de «soporte_inicio» en cada empresa.
3. **Si no sabes el alcance:** pon el servicio en mantenimiento. Es preferible cortar unas horas a seguir exponiendo datos.
4. **Conserva evidencia:** descarga los logs de Render del período, guarda una copia de `platform.sqlite` (ver OPERACION.md 7.3, paso 3) y capturas. No borres nada.

## 3. Rotar llaves (mismo día)

Rota **todo lo que pudo verse**, siguiendo [SECRETOS.md](SECRETOS.md). Orden sugerido:
1. Contraseñas y 2FA de Render, GitHub, Cloudflare, R2 y correo.
2. Llaves de R2 (`SCORTA_S3_ACCESS_KEY_ID` / `SECRET`).
3. `SCORTA_BACKUP_KEY` si pudo filtrarse (los respaldos viejos siguen cifrados con la llave anterior: **guárdala** hasta que venzan).
4. URL de Healthchecks y cualquier otro token.
5. Contraseña del propietario y, si aplica, de los administradores afectados.

## 4. Restaurar (si hubo cambios de datos)

Si el atacante modificó o borró datos, restaura el último respaldo **anterior** al incidente con [OPERACION.md](OPERACION.md#5-restauración-paso-a-paso-en-render). Si el atacante pudo tener acceso a Render, comprueba antes que el código desplegado sea el de GitHub.

## 5. Avisar

| A quién | Cuándo | Cómo |
|---|---|---|
| **Almacenes afectados** | Lo antes posible, apenas sepas qué datos se afectaron. Ellos son los responsables de los datos de sus clientes y deben poder actuar. | WhatsApp y correo al representante legal. Plantilla abajo. |
| **Abogado** | El mismo día. | Llamada. |
| **SIC** (Superintendencia de Industria y Comercio) | Si hubo violación de los códigos de seguridad o riesgo para los datos personales. **El plazo exacto y el canal deben confirmarlo con el abogado.** Como encargado, SCORTA debe además informar al almacén (responsable) para que él reporte lo suyo. | Lo define el abogado. |
| **Titulares** (clientes finales) | Si el abogado y el almacén lo deciden. | Normalmente lo hace el almacén. |

**Plantilla para el almacén:**

> Hola, [nombre]. Te escribimos de SCORTA para informarte de un incidente de seguridad. El [fecha] a las [hora] detectamos [descripción corta]. Los datos que pudieron verse afectados de tu empresa son: [lista: p. ej. nombres y teléfonos de clientes, ventas del día X]. Ya hicimos lo siguiente: [cerramos sesiones / cambiamos llaves / restauramos]. Te recomendamos: [cambiar contraseñas de tus usuarios / revisar ventas desde la hora X]. Estamos revisando con nuestro asesor legal si corresponde reportarlo a la SIC y te mantendremos informado. Cualquier duda, respóndenos aquí.

## 6. Cerrar (en 1–2 semanas)

Escribe en el registro: causa, datos afectados, empresas afectadas, a quién se avisó y cuándo, qué se cambió para que no se repita. Agrega las tareas nuevas a `PENDIENTES-SCORTA.md`.

---

## Simulacro (cada 6 meses, 45 minutos)

**Escenario:** «Un administrador de un almacén publicó por error en un grupo de WhatsApp una captura con la llave `SCORTA_S3_SECRET_ACCESS_KEY` y la URL de Render. Además, ayer hubo 300 intentos fallidos de login contra el usuario del propietario.»

Hazlo en el **staging** o solo «en papel», nunca rotando de verdad las llaves de producción sin plan.

| Paso | Qué hacer | Tiempo objetivo | ¿Hecho? |
|---|---|---|---|
| 1 | Abrir el registro del incidente con hora y fuente | 5 min | |
| 2 | Decidir si se pone mantenimiento (sí/no y por qué) | 5 min | |
| 3 | Revisar en el log los intentos contra el propietario y la IP de origen | 10 min | |
| 4 | Ubicar en [SECRETOS.md](SECRETOS.md) cómo se rota la llave de R2 y quién la tiene | 5 min | |
| 5 | Rotar la llave en staging y comprobar que el siguiente respaldo llega a Healthchecks | 10 min | |
| 6 | Redactar el aviso al almacén con la plantilla | 5 min | |
| 7 | Anotar qué preguntas llevarías al abogado (¿hay que reportar a la SIC?) | 5 min | |

**Al terminar:** anota qué tomó más tiempo, qué no estaba documentado y corrige este documento.

| Fecha | Participantes | Duración real | Hallazgos |
|---|---|---|---|
| | | | |
