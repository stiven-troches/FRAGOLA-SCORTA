# Pendientes de SCORTA — lista maestra

Actualizada: 2026-11-25, después de la auditoría tarea por tarea contra el código y de la ronda de trabajo con agentes (rama `release/pendientes-lanzamiento`). Reemplaza la versión de la junta del 2026-11-21: los IDs se conservan.

**Prioridad:** 🔴 bloquea la venta · 🟠 primer mes · 🟡 antes de crecer (~5–10 empresas) · ⚪ cuando haga falta

## Resumen

| | Tareas |
|---|---|
| Tareas técnicas (agentes) hechas | **100 de 143** |
| Técnicas que esperan algo tuyo (cuenta, decisión, dispositivo real o abogado) | 26 |
| Técnicas de la fase de crecimiento (Postgres) | 17 |
| Tareas tuyas | 52 (ver abajo) |

**Pruebas:** 496 de 497 pasan (1 omitida a propósito: la credencial privada de JE). Compilan la app y la demo.

---

## 1. Lo que ya está hecho (técnico)

**Backend:** BE-01 a BE-23, BE-28 (búsqueda paginada `/api/v2/search/*`), BE-29 (recarga incremental con 304), BE-30 (fotos y logos fuera de la base: R2 o `DATA_DIR/media`), BE-32 a BE-38 (incluye el retiro del modo antiguo motoshop), BE-40. Alertas por correo al propietario (disco, seguridad, respaldo fallido y ráfagas de errores 5xx) y descarga de los datos de un cliente final (Ley 1581).

**Frontend:** FE-01 a FE-24 (incluye pruebas de tamaños táctiles, «Reintentar», «Deshacer», términos de la demo y capturas nuevas en `SCORTA/docs/capturas`, regenerables con `npm run capturas`). Los textos legales y el número de WhatsApp los pones tú.

**Datos:** DM-01 (plantilla Excel con instrucciones e importación `.xlsx`), DM-02 a DM-05 (modelo, migraciones, importador y verificación para Postgres, listos pero sin conectar).

**DevOps:** OPS-08, OPS-10, OPS-12, OPS-14, OPS-17, OPS-19 (tarjeta «Estado del servidor»), OPS-20, OPS-21 (`SCORTA/docs/SALIDA-DE-RENDER.md`). El código de OPS-01, OPS-03 y OPS-09 está listo; falta crear las cuentas. Ensayo de restauración automático: `npm run ensayo:restauracion` (OK el 2026-11-25).

**Seguridad:** SEG-01, SEG-03, SEG-06 a SEG-09, SEG-12, SEG-13. SEG-10 (revisión interna): ver la sección 4.

**QA:** QA-01 a QA-06, QA-08 a QA-10, QA-12, QA-13.

**Documentación:** DOC-01, DOC-02, DOC-04 a DOC-13 (DOC-03 espera al abogado) (los borradores legales y comerciales están en `NEGOCIO/`, fuera de git).

---

## 2. Técnicas que esperan algo tuyo

| ID | Qué falta | Qué necesita de ti |
|---|---|---|
| OPS-01, OPS-03 | Respaldo cifrado cada hora y aviso si falla | Bucket R2, llave solo de escritura, check en Healthchecks.io y las variables en Render |
| OPS-02 | Ensayo con un respaldo **real** del bucket y RTO anotado | Tener Render y R2 andando |
| OPS-04 | Monitoreo de caídas y página de estado | Cuenta de UptimeRobot |
| OPS-05 | Despliegue solo con CI en verde | Proteger `main` en GitHub y sincronizar el Blueprint |
| OPS-06, OPS-11 | Revisar Render y probar un snapshot del disco | Plan pago con disco |
| OPS-07 | Logs fuera de Render (las alertas 5xx ya van por correo) | Cuenta de un servicio de logs (Better Stack, Axiom…) |
| OPS-09 | Staging | Decidir si lo pagas (~7 USD/mes) y crear la rama: `git push origin main:staging` |
| OPS-13 | WAF y límites en Cloudflare | Dominio propio en Cloudflare |
| SEG-02, QA-07 | Comprobar la IP real detrás de Render | Render andando (pasos en OPERACION.md) |
| SEG-04 | Borrar `SCORTA_OWNER_PASSWORD` tras el primer arranque y anotar la rotación | Render andando |
| SEG-05 | Hacer el simulacro (el guion de 30 min ya está) | 30 minutos tuyos |
| SEG-11 | Prueba de intrusión externa | Contratarla antes de 10 clientes |
| SEG-14 | Revisar las reglas RLS de Supabase de PRENOTA | Acceso al proyecto PRENOTA |
| SEG-15 | Hash de contraseñas más fuerte | Tu decisión (US-41) |
| FE-03, FE-10, FE-11 | Textos legales finales, número de WhatsApp y precio en la página de inicio | Abogado (US-20), tu número, tu precio (US-01) |
| QA-11, QA-14 | Prueba de mostrador y abrir reportes en Excel de escritorio | Un vendedor real y un PC con Excel |
| DOC-03 | Publicar la lista de subencargados (borrador en `NEGOCIO/SUBENCARGADOS.md`) | Validación del abogado |
| BE-41 a BE-43 | Factura DIAN, WhatsApp Business API, pasarela de pago | Decisiones US-25 y US-04 y sus cuentas |

---

## 3. Fase de crecimiento: Postgres (🟡, antes de 5–10 empresas)

El modelo, las migraciones, el importador y la verificación ya existen en `SCORTA/db/` y tienen pruebas en CI, pero la app sigue en SQLite. Conectarlo es reescribir la capa de datos de la app: es un proyecto propio que conviene hacer con un Postgres de staging real.

BE-24, BE-25, BE-26, BE-27, BE-31 · DM-06, DM-07, DM-08, DM-09, DM-10, DM-11 · OPS-15, OPS-16, OPS-18 · QA-15, QA-16 · BE-39 (varias sedes, ⚪).

Siguiente paso recomendado cuando llegue: contratar Postgres en Render (US-46) → interruptor `SCORTA_DB` (BE-25) → ensayos de migración (DM-09).

---

## 4. Revisión interna de seguridad (SEG-10)

Resultado de la revisión del 2026-11-25 sobre la rama `release/pendientes-lanzamiento`: ver `SCORTA/docs/seguridad.md` (sección «Revisión interna 2026-11-25»).

---

## 5. Tus tareas

Sin cambios respecto a la versión anterior, salvo las marcadas.

### Decisiones comerciales
| ID | Tarea | Prior. |
|---|---|---|
| US-01 | **Precio**: plan único, tarifa de alta y descuento anual | 🔴 |
| US-02 | **Prueba gratis y mora**: días de prueba, corte, gracia, suspensión y reactivación | 🔴 |
| US-03 | **Condiciones del piloto con JE**: fin, precio y criterios de éxito | 🔴 |
| US-04 | **Medios de cobro**: cuenta y enlace fijo (Wompi, Nequi o QR) | 🔴 |
| US-05 | **Plan pago de Render con disco** | 🔴 |
| US-06 | **Región de Render** (`render.yaml` ya dice Ohio) | 🔴 |
| US-07 | Comprobar que los datos sobreviven a un deploy (`DATA_DIR=/var/data` ya está en `render.yaml`) | 🔴 |
| US-08 | Cuenta de almacenamiento de respaldos (R2) y llaves en Render. **Nuevo:** opcionalmente un segundo bucket para fotos (`SCORTA_MEDIA_S3_*`) | 🔴 |
| US-09 | **2FA** en Render, Cloudflare, GitHub, R2 y tu correo | 🔴 |
| US-10 | Usuario y empresa del propietario propios y contraseña larga y única | 🔴 |
| US-11 | Aprobar **RPO ≤1 h y RTO ≤4 h** | 🔴 |
| US-12 | Confirmar qué día cuenta una devolución hecha después del cierre (el código usa la fecha original y la marca «después del cierre») | 🟠 |
| US-13 | Presupuesto de infraestructura por etapa | 🟠 |
| US-14 | **Dominio propio** | 🟠 |

### Con el abogado
| ID | Tarea | Prior. |
|---|---|---|
| US-15 | **Contrato SaaS** con anexo de encargado del tratamiento (borrador en `NEGOCIO/`) | 🔴 |
| US-16 | **Dos políticas de datos** (borrador en `NEGOCIO/`) | 🔴 |
| US-17 | **Transferencia internacional** (Render y R2 en EE. UU.) | 🔴 |
| US-18 | Consultar la inscripción en el **RNBD** | 🔴 |
| US-19 | Cláusula: **el almacén sigue obligado a facturar ante la DIAN** | 🔴 |
| US-20 | Textos finales de términos y privacidad para la app | 🔴 |
| US-21 | Validar habeas data y registro de tratamiento (borradores en `NEGOCIO/`) | 🔴 |
| US-22 | Condiciones comerciales: renovación, precio, terminación, reembolsos | 🟠 |
| US-23 | Registro de la marca SCORTA | 🟠 |
| US-24 | Constituir una SAS | 🟠 |
| US-25 | **Decidir sobre la DIAN** con el contador | 🔴 |
| US-26 | **Consentimiento escrito de JE** para su nombre y WhatsApp en la demo | 🔴 |
| US-27 | Plazos de retención de datos | 🟡 |
| US-28 | Seguro de responsabilidad o ciberriesgo | ⚪ |

### Con el contador
| ID | Tarea | Prior. |
|---|---|---|
| US-29 | **RUT, régimen, IVA del SaaS, ICA y tu facturación electrónica** | 🔴 |

### Con el almacén piloto
| ID | Tarea | Prior. |
|---|---|---|
| US-30 | Crear la empresa y las cuentas reales del piloto | 🔴 |
| US-31 | **Conteo físico** y carga con la plantilla Excel (ya disponible en Inventario → Importar) | 🔴 |
| US-32 | Registrar mecánicos y porcentajes | 🔴 |
| US-33 | **Matriz de dispositivos**: Android de gama baja, iPhone, tablet, PC | 🔴 |
| US-34 | Probar la **impresora térmica** de 80/58 mm | 🔴 |
| US-35 | Enviar un comprobante por WhatsApp a un cliente real | 🔴 |
| US-36 | **Revisión visual** de las pantallas (capturas nuevas en `SCORTA/docs/capturas`) | 🔴 |
| US-37 | **Piloto de 1–2 semanas**: 10 cierres seguidos sin diferencias y 0 fallos graves | 🔴 |
| US-38 | Grabar los videos (guiones en `NEGOCIO/VIDEOS-GUIONES.md`) | 🟠 |

### Operación del negocio
| ID | Tarea | Prior. |
|---|---|---|
| US-39 | **Canal de soporte**: WhatsApp Business separado, horario y tiempo de respuesta | 🟠 |
| US-40 | Plantilla de aviso de caídas | 🟠 |
| US-41 | Decidir si refuerzas el hash de contraseñas | 🟠 |
| US-42 | Lista de 20–30 prospectos y embudo | 🟠 |
| US-43 | Seguimiento a los días 3, 15 y 30 | 🟠 |
| US-44 | Alertas de monitoreo y respaldo en tu celular. **Nuevo:** define `SCORTA_OWNER_EMAIL` y Resend para recibir las alertas por correo | 🔴 |
| US-45 | Alerta de gasto en Render y R2 | 🟡 |
| US-46 | Contratar Postgres en Render (fase de crecimiento) | 🟡 |
| US-47 | Aprobar la ventana de migración a Postgres | 🟡 |
| US-48 | Caso de éxito de JE | 🟡 |
| US-49 | Programa de referidos | 🟡 |
| US-50 | Revisar el costo de Render con el uso real | ⚪ |
| US-51 | Encuesta de salida | ⚪ |
| US-52 | ✅ Carpetas `_respaldo-*` borradas (2026-11-25) | — |
| US-53 | **Nuevo:** número de WhatsApp comercial para la página de inicio y la demo (`src/landing.mjs`, `src/platform-demo.mjs`) | 🔴 |
| US-54 | **Nuevo:** si el repositorio de GitHub es público, hacerlo privado: `NEGOCIO/` y una clave pública de Supabase siguen en el historial | 🔴 |
