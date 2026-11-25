# Plan de respuesta a incidentes de seguridad

Una página para actuar rápido. Aplica cuando alguien pudo **ver, cambiar o llevarse datos sin permiso**: cuenta robada, llave o contraseña filtrada, acceso de una empresa a datos de otra, respaldo expuesto, equipo del dueño perdido. Para caídas y fallas técnicas usa el runbook de [OPERACION.md](OPERACION.md#7-runbook-de-incidentes).

**Responsable:** el dueño de SCORTA. **Apoyo:** abogado (avisos legales) y el agente o técnico de seguridad.

## 1. Detectar (minuto 0)

Señales: alerta de login del propietario desde otro lugar, muchos intentos fallidos en el log, un almacén reporta datos que no son suyos, un secreto aparece en GitHub o en un chat, aviso de Render/Cloudflare/GitHub, cambios en la auditoría que nadie reconoce.

Abre el **registro del incidente** (una nota con fecha) y escribe: hora, quién avisó, qué se vio. Desde aquí, anota cada acción con su hora.

## 2. Contener (primera hora)

1. **Cierra las sesiones.**
   - Una cuenta: restablece su contraseña desde el panel del propietario (cierra sus sesiones) o desactívala.
   - Una empresa: en el panel del propietario, **Cerrar sesiones de la empresa** (BE-12); si hace falta impedir el ingreso, inhabilítala.
   - Toda la plataforma: en el panel del propietario, **Cerrar todas las sesiones** (BE-12; tu sesión actual sigue abierta). Si no confías en la cuenta del propietario, activa `SCORTA_MAINTENANCE=1` en Render.
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

---

## Ejercicio de mesa: contraseña del propietario filtrada (30 minutos)

Ejercicio **en papel**: nadie toca producción. Se lee cada escena en voz alta, el responsable dice qué haría y dónde lo haría, y el facilitador compara con las acciones esperadas. Sirve para comprobar que este plan, [seguridad.md](seguridad.md) y [SECRETOS.md](SECRETOS.md) alcanzan para actuar sin improvisar.

**Roles:** facilitador (lee las escenas y toma el tiempo), responsable (el dueño, decide) y anotador (llena el registro). Con dos personas, el facilitador también anota.

**Material:** este documento, [seguridad.md](seguridad.md), [SECRETOS.md](SECRETOS.md), [OPERACION.md](OPERACION.md), el panel del propietario de **staging** abierto (para señalar botones, no para pulsarlos en producción) y un reloj.

### Escena 1 (minuto 0): el aviso

> Un lunes a las 8:10 a. m. te llega un correo de un servicio de alertas de filtraciones: tu correo de propietario aparece en una lista publicada con una contraseña en texto claro. Es la misma contraseña que usas en SCORTA. En el panel del propietario, *Eventos de seguridad* muestra a las 3:42 a. m. «Intentos fallidos de ingreso» contra tu usuario y a las 3:47 a. m. «Ingreso del propietario desde un origen nuevo».

Preguntas: ¿Es un incidente de seguridad o una falsa alarma? ¿Qué haces en los primeros 10 minutos?

**Acciones esperadas (10 min):**

1. Abrir el registro del incidente con hora, fuente (correo de alerta) y lo visto en *Eventos de seguridad*.
2. Tratarlo como incidente: hubo un ingreso desde un origen nuevo que no reconoces. La 2FA es obligatoria en producción (SEG-01), así que ese ingreso **también necesitó un código válido**: suponer que el atacante tiene la contraseña y quizá el segundo factor.
3. Cambiar la contraseña del propietario (cierra todas sus sesiones) por una nueva, única, del gestor de contraseñas.
4. **Cerrar todas las sesiones** de la plataforma desde el panel (BE-12).
5. Cambiar la contraseña del correo del propietario y revisar que tenga 2FA: es el canal de recuperación (SEG-13).
6. Cambiar esa misma contraseña en cualquier otro servicio donde se reutilizó (Render, GitHub, Cloudflare, R2, el gestor de correo).

### Escena 2 (minuto 10): qué hizo el intruso

> Al revisar la auditoría de las empresas ves que a las 3:49 a. m. alguien inició **modo soporte** en «Repuestos El Centro» con el motivo «revisión». Tú no lo hiciste. La sesión duró 25 minutos. En la auditoría de la plataforma aparece, a las 4:05 a. m., una exportación completa de esa empresa (`company.export`).

Preguntas: ¿El segundo factor está comprometido? ¿Qué datos pudieron salir y de quién? ¿Hay que parar el servicio?

**Acciones esperadas (10 min):**

1. Asumir el segundo factor comprometido: rehacer la 2FA del propietario (retirar `totp` del usuario con acceso directo a la base, como indica [seguridad.md](seguridad.md#verificación-en-dos-pasos-2fa-del-propietario), y activarla de nuevo con un celular de confianza). Revisar si el secreto TOTP estaba en una copia en la nube del celular.
2. Decidir el mantenimiento: si no se puede asegurar la cuenta del propietario en minutos, activar `SCORTA_MAINTENANCE=1` en Render. Anotar la decisión y el porqué.
3. Conservar evidencia antes de cambiar más cosas: logs de Render del período (3:30–4:30 a. m.), copia de `platform.sqlite`, capturas de *Eventos de seguridad* y de la auditoría de la empresa.
4. Determinar el alcance: «Repuestos El Centro» (exportación completa: clientes con nombre, teléfono y placas, ventas). Revisar la auditoría de **todas** las demás empresas por `soporte_inicio` desde las 3:42 a. m.
5. Revisar si el intruso cambió algo en la plataforma: usuarios nuevos, restablecimientos de contraseña, empresas habilitadas o inhabilitadas, pagos registrados.

### Escena 3 (minuto 20): avisar y cerrar

> Son las 8:40 a. m. El administrador de «Repuestos El Centro» te escribe: vio el aviso «El soporte de SCORTA está trabajando en tu cuenta» en la madrugada y pregunta qué pasó.

Preguntas: ¿Qué le respondes y cuándo? ¿A quién más avisas? ¿Qué queda pendiente?

**Acciones esperadas (10 min):**

1. Responder al almacén con la plantilla de la sección 5: qué pasó, qué datos de su empresa pudieron salir, qué se hizo y qué le recomiendas (cambiar contraseñas de sus usuarios, estar atento a mensajes extraños a sus clientes).
2. Llamar al abogado el mismo día; llevar la pregunta de si corresponde reportar a la SIC y en qué plazo. Recordar que el almacén es el responsable de los datos y SCORTA el encargado.
3. Revisar si hay que rotar llaves según la sección 3 (si el intruso no tuvo acceso a Render ni al correo, las llaves de R2 y de respaldo pueden quedarse; anotar por qué).
4. Anotar las tareas para no repetirlo (por ejemplo: alerta inmediata por correo cuando el propietario ingresa desde un origen nuevo) y llevarlas a `PENDIENTES-SCORTA.md`.

### Cómo evaluar

| Criterio | Cumple si… |
|---|---|
| Tiempo de contención | Contraseña cambiada y sesiones cerradas antes del minuto 10. |
| Evidencia | Se pensó en guardar logs y base **antes** de restaurar o borrar algo. |
| Alcance | Se revisaron todas las empresas, no solo la mencionada. |
| Comunicación | El aviso al almacén salió con la plantilla y sin prometer lo que no se sabe. |
| Documentación | Cada paso que no estaba escrito o era confuso quedó anotado para corregir este documento. |

### Registro del ejercicio

Llena una fila por cada ejercicio realizado. **Todavía no se ha hecho ninguno**; la fila de ejemplo muestra el formato y no corresponde a un ejercicio real.

| Fecha | Escenario | Participantes | Duración real | Contención antes del min 10 | Faltantes en la documentación | Acciones de mejora (responsable, fecha) |
|---|---|---|---|---|---|---|
| *Ejemplo: AAAA-MM-DD* | *Contraseña del propietario filtrada* | *Dueño (responsable), socio (facilitador)* | *34 min* | *Sí (8 min)* | *No estaba claro cómo retirar `totp` desde Render Shell* | *Escribir el comando en seguridad.md (dueño, AAAA-MM-DD)* |
| | | | | | | |
