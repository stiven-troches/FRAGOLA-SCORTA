# Pendientes de SCORTA — lista maestra (versión junta directiva)

Actualizada: 2026-11-21. Esta versión reemplaza la lista anterior de 104 tareas. La revisaron 7 directores: CTO, Seguridad (CISO), Producto y UX, Operaciones/SRE, Legal, Comercial y QA. Cambiaron prioridades, unieron tareas duplicadas y agregaron las que faltaban.

**Prioridad:** 🔴 bloquea la venta · 🟠 primer mes · 🟡 antes de crecer (~5–10 empresas) · ⚪ cuando haga falta
**Origen:** `#n` es el número de la lista anterior · `N` es una tarea nueva de la junta · `(Dir)` indica qué director la propuso o la modificó.

**Responsables:**
| Agente | Se encarga de |
|---|---|
| **BE** · Agente Backend | Lógica del servidor, API, reglas de negocio |
| **FE** · Agente Frontend | Pantallas, celular, comprobantes, demo |
| **DM** · Agente Datos y Migración | Modelo de datos, migración a Postgres, importaciones |
| **OPS** · Agente DevOps/SRE | Render, respaldos, monitoreo, CI/CD |
| **SEG** · Agente Seguridad | Seguridad, secretos, aislamiento entre empresas, incidentes |
| **QA** · Agente QA | Pruebas, criterios de salida, piloto |
| **DOC** · Agente Documentación | Manuales, procedimientos, textos comerciales y legales (borradores) |
| **TÚ** | Decisiones, cuentas, pagos, abogado, contador, almacén piloto |

> Notas de la junta:
> - Se descartó un hallazgo de Operaciones: el apagado **sí** cierra SQLite antes de salir (verificado).
> - "Preparar reposición" ya existe en la app, por eso no se agregó.

---

## Ruta crítica para empezar a vender (en este orden)

1. **TÚ:** precio, prueba gratis, mora y medios de cobro (US-01 a US-04). Contrata Render con disco en la región correcta (US-05 a US-07).
2. **OPS/BE:** respaldo cifrado cada hora, modo mantenimiento, respaldo al arrancar y monitoreo (OPS-01 a OPS-06, BE-01 a BE-03).
3. **SEG:** 2FA del propietario, IP real y enlaces de comprobante seguros (SEG-01 a SEG-04).
4. **FE/BE:** descuentos, consentimiento de datos, leyenda "no es factura" y ajustes para celular (BE-04, BE-05, FE-01 a FE-03).
5. **TÚ + abogado + contador:** contrato, política de datos, RUT y facturación propia (US-15 a US-24).
6. **QA + TÚ + almacén:** criterios de lanzamiento, revisión visual, piloto de 1–2 semanas y corrección de hallazgos (QA-01 a QA-06, US-30 a US-38).

---

## BE · Agente Backend

| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| BE-01 | **Modo mantenimiento**: el servicio arranca sin abrir la base para poder ejecutar `restore --offline` desde Render Shell | 🔴 | N (Ops) |
| BE-02 | **Respaldo local automático al arrancar** cada deploy, antes de abrir la base | 🔴 | N (Ops) |
| BE-03 | Al restaurar: vaciar ventas pendientes y borrar `-wal`/`-shm` vacíos | 🔴 | #46 (CTO, Ops) |
| BE-04 | **Descuento y precio editable** por línea y por total, con tope por rol y auditoría | 🔴 | N (Producto) |
| BE-05 | **Casilla de autorización de datos** al guardar el teléfono o la placa de un cliente, con registro de fecha y medio (Ley 1581) | 🔴 | N (Producto, Legal) |
| BE-06 | **Tope temporal de fotos** por empresa (cantidad y peso) hasta que salgan de la base | 🔴 | N (CTO) |
| BE-07 | Registro de **aceptación de términos** (versión, fecha, persona; la acepta el representante legal) y bloqueo del primer acceso | 🔴 | #15 (Legal) |
| BE-08 | **Exportación completa de una empresa** (procedimiento desde el primer cliente) | 🟠 | #94 (CTO, Legal, CISO) |
| BE-09 | **Consulta, corrección y borrado** de datos de un cliente final a petición, más borrado verificable al terminar el contrato | 🟠 | #95 + N (Legal) |
| BE-10 | Sacar las **lecturas de la cola global** (caché por versión) para que la recarga no frene las ventas | 🟠 | N (CTO) |
| BE-11 | `/healthz` con **versión desplegada, uso de disco, tamaño del JSON y latencia p95**, y alerta al 80 % de disco | 🟠 | N (Ops, CTO) |
| BE-12 | **Revocar todas las sesiones** de una empresa o de la plataforma, con auditoría | 🟠 | N (CISO) |
| BE-13 | Exigir el número de revisión en `ajuste` y en cambios de empresa | 🟠 | #45 |
| BE-14 | Día al que se imputa una devolución hecha después del cierre (implementar tras la decisión de US-12) | 🟠 | #50 |
| BE-15 | **Cierre de caja con base inicial, gastos y retiros** | 🟠 | #100 (Producto) |
| BE-16 | **Ventas a crédito y cartera** (fiado a mecánicos y talleres) | 🟠 | #103 (Producto) |
| BE-17 | **Cotizaciones**: no descuentan stock, se envían por WhatsApp y se convierten en venta | 🟠 | N (Producto) |
| BE-18 | **IVA**: precio con IVA incluido y desglose en el comprobante, configurable por empresa | 🟠 | N (Producto) |
| BE-19 | **Cliente con cédula o NIT** opcional y ficha reutilizable | 🟠 | N (Producto) |
| BE-20 | **Indicador de uso por empresa**: última venta, ventas de 7 días y último acceso (clientes en riesgo) | 🟠 | N (Comercial) |
| BE-21 | Usar la hora inyectada en movimientos, entregas y reversiones | ⚪ | #47 |
| BE-22 | Redondear los totales de reportes de compras, valor de stock y venta promedio | ⚪ | #48 |
| BE-23 | Costo promedio exacto al anular una compra antigua | ⚪ | #49 |
| BE-24 | **Capa de repositorio**: interfaz de datos única para que las pruebas corran igual en SQLite y Postgres | 🟡 | N (CTO, QA) |
| BE-25 | **Interruptor SQLite/Postgres** por variable, para volver atrás rápido el día del cambio | 🟡 | N (CTO) |
| BE-26 | Reescribir la capa de datos: cada operación toca solo sus filas, en transacción (fin de la cola global) | 🟡 | #76 |
| BE-27 | **Stock concurrente por producto**: elimina los conflictos falsos entre cajas | 🟡 | #77 + #44 |
| BE-28 | **API paginada y de búsqueda** en el servidor (🟠 si el piloto tiene más de 5.000 referencias) | 🟡 | #79 (CTO) |
| BE-29 | Sincronización incremental, sin recargar todo cada 15 s | 🟡 | #80 |
| BE-30 | **Fotos y logos fuera de la base** (R2/S3) | 🟠 | #82 (CTO) |
| BE-31 | Sesiones y límites de login en la base, para varias instancias | 🟡 | #83 |
| BE-32 | **Métricas del negocio** en el panel del propietario: ingreso mensual, clientes activos, en prueba, vencidos y bajas | 🟡 | N (Comercial) |
| BE-33 | Alertas de seguridad: muchos logins fallidos, propietario desde una IP nueva, inicio de modo soporte | 🟡 | N (CISO) |
| BE-34 | Separados con abonos | 🟡 | N (Producto) |
| BE-35 | Garantías y piezas en reclamo al proveedor | 🟡 | N (Producto) |
| BE-36 | Lista de precios por tipo de cliente (mostrador, mecánico, mayorista) | 🟡 | N (Producto) |
| BE-37 | Límites por empresa según el plan (usuarios, productos, fotos) | ⚪ | #93 |
| BE-38 | Retirar el modo antiguo "motoshop" **antes** de la migración, para migrar menos | 🟠 | #71 (CTO) |
| BE-39 | Varias sedes por empresa, con traslados | ⚪ | #101 |
| BE-40 | Órdenes de compra y cuentas por pagar | ⚪ | #102 |
| BE-41 | Facturación electrónica DIAN mediante un proveedor autorizado (si US-25 lo decide) | ⚪ | #97 |
| BE-42 | WhatsApp Business API para avisos automáticos | ⚪ | #98 |
| BE-43 | Pasarela de pago automática (después del enlace de pago de US-04) | ⚪ | #99 |

## FE · Agente Frontend

| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| FE-01 | **Celular**: botones de 44 px y campos de 16 px (sin zoom en iPhone), antes del piloto | 🔴 | #56 (Producto) |
| FE-02 | **Leyenda en el comprobante**: "Documento comercial, no es factura electrónica", con NIT y nombre del almacén | 🔴 | N (Legal) |
| FE-03 | Publicar los **textos legales finales** y un **aviso de privacidad corto** en el login y en el registro de clientes | 🔴 | #14 (Legal) |
| FE-04 | Precios iguales en todas las pantallas (carrito y comprobante) | 🟠 | #51 |
| FE-05 | Si falla la carga del borrador, bloquear solo el carrito y no toda la app | 🟠 | #52 |
| FE-06 | **Pago dividido** y **Nequi/Daviplata** como medios, con cálculo de vueltas | 🟠 | N (Producto) |
| FE-07 | **Varias ventas en espera** en el mostrador | 🟠 | N (Producto) |
| FE-08 | **Asistente de primer uso**: logo, mecánicos, importar inventario, crear vendedores | 🟠 | N (Producto) |
| FE-09 | **Recordatorio de pago con un clic** por WhatsApp desde el panel del propietario | 🟠 | N (Comercial) |
| FE-10 | Botón **"Pedir prueba por WhatsApp"** en la demo pública | 🟠 | #33 (Comercial) |
| FE-11 | **Página web de una sola página**: propuesta, precio, demo, WhatsApp y enlaces legales | 🟠 | N (Comercial) |
| FE-12 | Aviso al instante cuando otra pestaña cambia el carrito | ⚪ | #53 |
| FE-13 | Un solo botón de "reintentar operación" | ⚪ | #54 |
| FE-14 | "Deshacer" en lugar de la confirmación al retirar una línea del carrito | ⚪ | #55 |
| FE-15 | Diálogos con buen manejo del foco y cierre con Escape (rapidez en PC y accesibilidad) | 🟡 | #57 (Producto) |
| FE-16 | Logo más liviano y carga por rol | ⚪ | #58 |
| FE-17 | **App instalable** en el celular (PWA) | 🟡 | #104 (Producto) |
| FE-18 | Uso sin conexión limitado | ⚪ | #104 |
| FE-19 | Lectura de códigos con la cámara (solo si el piloto la pide) | ⚪ | #59 |
| FE-20 | Atajos de teclado en PC (buscar, cobrar, cambiar medio de pago) | ⚪ | N (Producto) |
| FE-21 | Mantener funcionando la demo con IndexedDB sobre la nueva API | 🟡 | #87 |
| FE-22 | Términos propios para la demo y garantía de que nunca usa datos reales sin autorización | 🟡 | N (Legal) |
| FE-23 | Comprobante: no aceptar logos `http:` | ⚪ | #40 |
| FE-24 | Regenerar las capturas de `docs/capturas` | ⚪ | #60 |

## DM · Agente Datos y Migración

| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| DM-01 | **Plantilla Excel de inventario** con instrucciones, y apoyo a la importación del piloto | 🔴 | #22 + N (Comercial, Producto) |
| DM-02 | **Diseño del modelo de datos** en Postgres: tablas por entidad con `company_id`; dinero en `NUMERIC`; fechas `timestamptz` con día comercial de Bogotá | 🟠 | #72 + N (CTO) |
| DM-03 | **Migraciones versionadas**, probadas al aplicar y al deshacer | 🟠 | #74 + N (QA) |
| DM-04 | **Script de migración** del JSON a tablas, con verificación **por empresa, por fecha y por tabla** (sumas de control) | 🟡 | #75 (QA) |
| DM-05 | **Índices** y búsqueda de texto (30.000 referencias en menos de 100 ms) | 🟡 | #78 |
| DM-06 | **Reportes con SQL** | 🟡 | #81 |
| DM-07 | Auditoría en su propia tabla, con la retención que fije US-27 | 🟡 | #84 |
| DM-08 | **Datos sintéticos a escala** (30 empresas × 30.000 referencias × 12 meses) | 🟡 | N (CTO, QA) |
| DM-09 | **2 ensayos de migración** en staging con una copia real anonimizada, midiendo la ventana | 🟡 | #86 (CTO, QA) |
| DM-10 | **Migración en producción**: respaldo, ventana nocturna, verificación y plan de reversa | 🟡 | #86 |
| DM-11 | Particionar o archivar ventas y movimientos (unos 9 millones de filas al año) | ⚪ | N (CTO) |

## OPS · Agente DevOps/SRE

| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| OPS-01 | **Respaldo cifrado cada 1 h** a R2/S3/B2 con versionado o bloqueo y llave solo de escritura; retención de 30 días | 🔴 | #3 (CTO, Ops, CISO) |
| OPS-02 | **Ensayo de restauración**: el primero antes de vender, luego cada trimestre, midiendo el RTO real | 🔴 | #4 (Ops, CISO, QA) |
| OPS-03 | **Aviso si falla el respaldo** con un "dead-man's switch" (Healthchecks.io gratis) | 🔴 | #10 (Ops) |
| OPS-04 | **Monitoreo de caídas** (UptimeRobot) y página de estado | 🔴 | #9 (Ops) |
| OPS-05 | **Despliegue solo con CI en verde** y rama `main` protegida | 🔴 | N (Ops) |
| OPS-06 | Revisar la configuración de Render (variables, health check, región) | 🔴 | #5 |
| OPS-07 | **Logs fuera de Render** (más de 7 días) y alerta por tasa de errores 5xx | 🟠 | #11 + #92 (Ops, CISO) |
| OPS-08 | **`render.yaml`**: infraestructura como código (servicio, disco, variables, región) | 🟠 | N (Ops) |
| OPS-09 | **Entorno de pruebas (staging)** en Render | 🟠 | #85 (Ops, QA, CTO) |
| OPS-10 | **Prueba de humo automática** después de cada deploy | 🟠 | N (QA) |
| OPS-11 | Confirmar los **snapshots diarios** del disco en Render y probar restaurar uno | 🟠 | N (Ops) |
| OPS-12 | **Dependencias**: Dependabot, `npm audit` semanal, gitleaks contra secretos, fijar `papaparse` y `@playwright/test`, y acciones de GitHub por SHA | 🟠 | #65 + N (CISO, Ops) |
| OPS-13 | Límite de intentos y WAF en Cloudflare para login, comprobantes y POST (si usas tu propio Cloudflare) | 🟠 | N (CISO) |
| OPS-14 | Ejecutar las pruebas en **Windows** en CI | ⚪ | #62 |
| OPS-15 | **Postgres en Render** con recuperación a un punto en el tiempo | 🟡 | #73 + #91 |
| OPS-16 | Pool de conexiones y tiempos límite según el plan de Postgres | 🟡 | N (CTO) |
| OPS-17 | Ejecutar la suite contra **Postgres en CI** | 🟡 | N (QA) |
| OPS-18 | 2 o más instancias y despliegues sin corte (**solo con Postgres**; con disco Render no lo permite) | ⚪ | #89 + #90 (CTO) |
| OPS-19 | Panel de métricas y alertas (latencia, errores, tamaño de la base) | ⚪ | #92 |
| OPS-20 | Cobertura mínima obligatoria en CI | ⚪ | N (QA) |
| OPS-21 | **Plan de salida de Render** (mudanza en menos de 1 día) | ⚪ | N (Ops) |

## SEG · Agente Seguridad

| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| SEG-01 | **2FA del propietario** (una cuenta controla todas las empresas) | 🔴 | #34 (CISO) |
| SEG-02 | **IP real confiable**: usar `CF-Connecting-IP` o la IP que añade el proxy, no la primera de `x-forwarded-for` (falsificable); comprobarlo en Render | 🔴 | #6 (CISO) |
| SEG-03 | **Comprobante público**: enmascarar el teléfono, revocar el enlace y no guardar el token en claro | 🔴 | #39 (CISO, Legal) |
| SEG-04 | **Inventario y rotación de secretos**; borrar `SCORTA_OWNER_PASSWORD` de Render tras el primer arranque | 🔴 | N (CISO) |
| SEG-05 | **Plan de respuesta a incidentes** de 1 página (contener, revocar, rotar, restaurar, avisar a clientes y a la SIC) y un simulacro | 🔴 | N (CISO, Legal) |
| SEG-06 | Que un usuario inexistente tarde lo mismo en el login | 🟠 | #35 |
| SEG-07 | Limitar intentos en "cambiar contraseña" | 🟠 | #36 |
| SEG-08 | Obligar a cambiar la contraseña tras un restablecimiento | 🟠 | #37 |
| SEG-09 | **Aviso visible** dentro de la empresa cuando el propietario entra en modo soporte | 🟠 | #41 (Legal) |
| SEG-10 | **Revisión interna de seguridad** antes del 2.º cliente | 🟠 | #43 (CISO) |
| SEG-11 | **Prueba de intrusión externa** antes de 10 clientes | 🟡 | #43 (CISO) |
| SEG-12 | **Aislamiento entre empresas en Postgres** (RLS o `company_id` obligatorio) con pruebas cruzadas | 🟡 | N (CTO, QA) |
| SEG-13 | Recuperación de contraseña por correo | 🟡 | #38 |
| SEG-14 | Revisar las reglas de seguridad (RLS) de Supabase de PRENOTA | 🟠 | #67 |
| SEG-15 | Hash de contraseñas más fuerte — **en espera de tu decisión** (US-41) | ⚪ | #42 |

## QA · Agente QA

| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| QA-01 | **Criterios de lanzamiento** escritos: 🔴 cerradas, piloto aprobado, restauración probada, 0 fallos graves | 🔴 | N (QA) |
| QA-02 | **Lista de regresión antes de cada despliegue** y registro de la versión desplegada | 🔴 | N (QA) |
| QA-03 | **Pruebas críticas**: dos ventas a la vez por la última unidad, aislamiento entre empresas, devolución después del cierre, respaldos dañados, cabeceras y dinero con valores extremos | 🔴 | #63 (QA) |
| QA-04 | **Guiones del piloto** con criterio pasa/falla medible, y registro de equipo y navegador | 🔴 | #24 (QA) |
| QA-05 | **Formato para registrar hallazgos** del piloto (gravedad y responsable de cerrarlo) | 🔴 | N (QA) |
| QA-06 | Cada hallazgo corregido con su **prueba de regresión** | 🔴 | #28 (QA) |
| QA-07 | Verificar el límite de intentos con la IP real (11 fallos no deben bloquear a otro equipo) | 🔴 | #6 |
| QA-08 | **Ampliar las pruebas de navegador**: venta, compra, devolución, anulación y cierre en escritorio y celular | 🟠 | #61 (QA) |
| QA-09 | Corregir las aserciones débiles (`status>=400`) | 🟠 | #64 |
| QA-10 | **Medición base con SQLite** (venta, búsqueda, reportes) | 🟠 | N (QA) |
| QA-11 | **Prueba de usabilidad en mostrador**: venta de 3 productos en menos de 30 s | 🟠 | N (Producto) |
| QA-12 | Pruebas con **red lenta o sin conexión** a mitad del cobro (sin venta doble) | 🟠 | N (QA) |
| QA-13 | Revisar la demo pública después de cada versión | 🟠 | N (Comercial) |
| QA-14 | Abrir en Excel de escritorio los reportes exportados | 🟠 | #30 |
| QA-15 | **Prueba de carga** antes de la migración, con datos sintéticos | 🟡 | #88 (CTO, QA) |
| QA-16 | Aprobación final de la migración (sumas de control) | 🟡 | #75/#86 |

## DOC · Agente Documentación

| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| DOC-01 | **RPO/RTO y runbook de incidentes** (caída, disco lleno, base dañada, aviso a clientes) en OPERACION.md | 🔴 | N (Ops) |
| DOC-02 | **Actualizar OPERACION.md y seguridad.md** para Render y `platform-backup` | 🔴 | #68 (Ops) |
| DOC-03 | **Lista pública de subencargados** (Render, respaldos, logs, correo; país y finalidad) | 🔴 | N (Legal) |
| DOC-04 | **Procedimiento de habeas data**: canal, formulario, plazos y registro de solicitudes | 🔴 | N (Legal) |
| DOC-05 | **Propuesta de valor y guion de venta** (dolores, beneficios, objeciones DIAN/internet/precio) | 🔴 | N (Comercial) |
| DOC-06 | **Cinco videos o guías de 1–2 min**: vender, comprar, cerrar caja, importar, mecánicos | 🟠 | #31 (Comercial) |
| DOC-07 | **Proceso de alta de un cliente nuevo**, con credenciales de un solo uso | 🟠 | #32 (CISO) |
| DOC-08 | **Preguntas frecuentes de soporte** (impresora, contraseña, qué no incluye, cómo pagar) | 🟠 | N (Comercial) |
| DOC-09 | Borrador del **registro de tratamiento de datos** y retención (lo valida el abogado) | 🟠 | N (CISO, Legal) |
| DOC-10 | Guion de demo de 15 minutos | 🟠 | #33 (Comercial) |
| DOC-11 | Mover los informes históricos a `docs/historico/` con un índice | ⚪ | #69 |
| DOC-12 | Inventario de licencias de dependencias y titularidad del código | 🟡 | N (Legal) |
| DOC-13 | Renombrar el paquete `motoshop` a `scorta` y separar PRENOTA del repositorio (con tu visto bueno) | 🟠 | #66 + #70 |

---

## TÚ · Tareas de tu parte

### Decisiones comerciales (empieza por aquí)
| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| US-01 | **Precio**: un plan único, tarifa de alta (importación y capacitación) y descuento anual | 🔴 | #18 (Comercial) |
| US-02 | **Política de prueba y mora**: días de prueba, fecha de corte, días de gracia, suspensión y reactivación | 🔴 | N (Comercial) |
| US-03 | **Condiciones del piloto con JE**: fecha de fin, precio acordado y criterios de éxito para convertirlo en cliente | 🔴 | #21/#27 (Comercial) |
| US-04 | **Medios de cobro**: cuenta y enlace de pago fijo (Wompi, Nequi o QR) | 🔴 | #99 + N (Comercial) |
| US-05 | **Contratar el plan pago de Render con disco** | 🔴 | #1 |
| US-06 | **Elegir la región de Render** (Ohio o Virginia) antes de cargar datos reales | 🔴 | N (Ops) |
| US-07 | Definir `DATA_DIR` y comprobar que los datos sobreviven a un deploy | 🔴 | #2 |
| US-08 | Crear la cuenta de almacenamiento de respaldos (R2/S3/B2) y pasar las llaves como variables | 🔴 | #3 |
| US-09 | **Activar 2FA** en Render, Cloudflare, GitHub, almacenamiento y tu correo | 🔴 | N (Ops, CISO) |
| US-10 | Cambiar usuario y empresa del propietario y usar una contraseña larga y única | 🔴 | #7 |
| US-11 | Aprobar las cifras de **RPO ≤1 h y RTO ≤4 h** | 🔴 | N (Ops) |
| US-12 | Decidir qué día cuenta una devolución hecha después de cerrar la caja | 🟠 | #50 |
| US-13 | **Presupuesto de infraestructura** por etapa (disco, Postgres, staging) para fijar el precio | 🟠 | N (CTO) |
| US-14 | **Dominio propio** | 🟠 | #8 |

### Con el abogado
| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| US-15 | **Contrato SaaS** con **anexo de encargado del tratamiento** (el almacén es responsable y SCORTA encargado), subencargados, confidencialidad, incidentes, entrega de datos y tope de responsabilidad | 🔴 | #12 (Legal, CISO) |
| US-16 | **Dos políticas de datos**: SCORTA como responsable (usuarios y empresas) y como encargado (clientes finales) | 🔴 | #13 (Legal) |
| US-17 | **Transferencia internacional** (Render en EE. UU., respaldos y logs): cláusulas y trámites ante la SIC | 🔴 | #16 + N (Legal) |
| US-18 | Consultar si debes inscribir la base en el **RNBD** | 🔴 | #16 |
| US-19 | Cláusula: **el almacén sigue obligado a facturar ante la DIAN** | 🔴 | #17 (Legal) |
| US-20 | Textos finales de términos y privacidad para la app (FE-03 los publica) | 🔴 | #14 |
| US-21 | Validar el procedimiento de habeas data y el registro de tratamiento (DOC-04, DOC-09) | 🔴 | N |
| US-22 | **Condiciones comerciales**: renovación, cambios de precio, terminación, reembolsos | 🟠 | N (Legal) |
| US-23 | **Registro de la marca SCORTA** ante la SIC | 🟠 | N (Legal, Comercial) |
| US-24 | **Constituir una SAS** para separar tu patrimonio | 🟠 | N (Legal) |
| US-25 | **Decidir sobre la DIAN** con el contador: si el comprobante reemplaza o no el documento del almacén, y si buscas un aliado (Alegra o Siigo) | 🔴 | #97 + N (Producto, Comercial) |
| US-26 | **Consentimiento escrito de JE** para mantener su nombre y WhatsApp en la demo (decidiste mantenerla) | 🔴 | N (CISO) |
| US-27 | Fijar los **plazos de retención** de datos (criterio contable y legal) | 🟡 | #84 (Legal) |
| US-28 | Seguro de responsabilidad civil o ciberriesgo | ⚪ | N (Legal) |

### Con el contador
| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| US-29 | **Formalización tributaria**: RUT con la actividad correcta, régimen, IVA del SaaS, ICA y **tu facturación electrónica** desde el primer cobro | 🔴 | #20 + N (Legal) |

### Con el almacén piloto
| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| US-30 | Crear la empresa y las cuentas reales del piloto | 🔴 | #21 |
| US-31 | **Conteo físico e inventario inicial** en la plantilla (DM-01) | 🔴 | #22 |
| US-32 | Registrar los mecánicos y sus porcentajes | 🔴 | #23 |
| US-33 | **Matriz de dispositivos**: Android de gama baja, iPhone, tablet, PC con Windows | 🔴 | #24 + N (QA) |
| US-34 | Probar la **impresora térmica** de 80/58 mm | 🔴 | #25 |
| US-35 | Enviar un comprobante por WhatsApp a un cliente real | 🔴 | #26 |
| US-36 | **Revisión visual** de las pantallas antes del piloto | 🔴 | #29 (Producto) |
| US-37 | **Piloto de 1–2 semanas**; salida con 0 diferencias inexplicables en 10 cierres seguidos y 0 fallos graves | 🔴 | #27 (QA) |
| US-38 | Grabar los videos con los guiones de DOC-06 | 🟠 | #31 |

### Operación del negocio
| ID | Tarea | Prior. | Origen |
|---|---|---|---|
| US-39 | **Canal de soporte**: WhatsApp Business separado del personal, horario y tiempo de respuesta | 🟠 | #19 (Comercial) |
| US-40 | **Plantilla de aviso de caídas** para clientes | 🟠 | N (Ops) |
| US-41 | Decidir si refuerzas el hash de contraseñas (el CISO lo recomienda: 1 línea de código) | 🟠 | #42 (CISO) |
| US-42 | **Lista de prospectos** (20–30 almacenes) y seguimiento del embudo | 🟠 | N (Comercial) |
| US-43 | **Seguimiento tras el alta**: llamada en los días 3, 15 y 30, con una nota de satisfacción | 🟠 | N (Comercial) |
| US-44 | Recibir las alertas de monitoreo y respaldo en tu celular | 🔴 | #9 |
| US-45 | Alerta de gasto en Render y R2 | 🟡 | N (Ops) |
| US-46 | Contratar Postgres en Render cuando llegue la Fase de crecimiento | 🟡 | #73 |
| US-47 | Aprobar la ventana de migración a Postgres | 🟡 | #86 |
| US-48 | Caso de éxito de JE (con permiso escrito) | 🟡 | N (Comercial) |
| US-49 | Programa de referidos | 🟡 | N (Comercial) |
| US-50 | Revisar el costo de Render frente a otras opciones con el uso real | ⚪ | #96 |
| US-51 | Encuesta de salida cuando un cliente cancele | ⚪ | N (Comercial) |
| US-52 | Borrar la carpeta `_respaldo-2026-11-20/` cuando confirmes que todo funciona | ⚪ | N (CISO) |

---

**Total:** 175 tareas. 123 son de agentes (BE 43 · FE 24 · DM 11 · OPS 21 · SEG 15 · QA 16 · DOC 13) y 52 son tuyas.

**Ya hecho (2026-11-20/21):** fecha de venta controlada · el vendedor no ve clientes ajenos · bloqueo PID corregido · IP configurable · `/healthz`, logs y HSTS · limpieza de datos y tope de tickets · costo promedio · sesión del propietario de 12 h y soporte de 2 h · buscador de venta · recarga pausada y paginación · código muerto borrado · 235 de 236 pruebas pasan.
