# Revisión 5 · entrega para revisión

## Cambios

Identidad de la empresa protagonista, SCORTA discreto en su panel y marca original grande en login/propietario. En celular: cuatro opciones inferiores fijas y contenido a todo el ancho; en PC: menú lateral. Los permisos filtran las opciones adicionales de Más.

Nueva venta separa carrito y cobro sin resumen superior repetido, datos de cliente opcionales y Más opciones para consultas/vaciado. Se conservan los borradores privados y los reintentos protegidos. El administrador abre el mismo registro de mano de obra que el vendedor, con su historial administrativo disponible aparte.

Ticket de venta de 80/58 mm, logo y datos opcionales NIT/dirección. Datos escapados, recursos y enlaces validados, impresión/PDF mediante navegador y descarga HTML. WhatsApp abre el enlace de comprobante; no adjunta ni envía automáticamente un PDF. El token público conserva su vencimiento.

Soporte: asunto y descripción desde Perfil; empresa/usuario/fecha automáticos. Campana por empresa para el propietario, pendientes y contador sin leer. Conversación, respuestas y estados abierto/en atención/resuelto. El vendedor ve sus propios tickets; admin ve los de su empresa; propietario puede atender todas. Leer un ticket no lo marca como leído para otros. Las acciones de soporte no cambian stock, revisión del negocio ni borradores.

JE Accesorios y Repuestos se prepara únicamente en demo: administrador Jhoan Monsalve, usuario joan, WhatsApp +573205878749, 80.000 COP mensuales tras la prueba, inventario vacío. El período incluye el día inicial y otros 29 días. Migración aditiva una sola vez; conserva cuentas/datos/sesiones y no recrea una empresa eliminada manualmente. Correo, NIT y dirección quedan vacíos. Contraseña solo como hash PBKDF2; su valor se entregó privadamente y no aparece en el código ni los accesos rápidos. Logo original assets/je-accesorios-repuestos.jpg, SHA-256 5b2356e459e051cf5e8b572ca43f036908d69abc7a0767b8fbfd40468c0df8a9; el data URI conserva los mismos bytes.

## Validación

122/122 pruebas Node, sin skips, incluidas soporte/lecturas/aislamiento, migración concurrente y acceso de JE, SSR y seguridad del ticket. El secreto de prueba se inyectó por stdin oculto al proceso, no por argumentos/archivo/código. Aplicación y demo compiladas; logo de JE contrastado byte por byte; diff sin errores. Dockerfile incluye support-tickets.mjs en compilación y runtime; no se construyó ni desplegó Docker. El demo emite aviso de chunk >500 kB, sin error de compilación.

El entorno Sites tiene SITES_MANAGED_LINUX_CONTAINER=1 y no dispone de cua_repl.js ni herramienta equivalente de escritorio. No se inició preview, instaló navegador ni se afirma validación visual por SSR. Siguen pendientes celular/PC reales, impresora, revisión conjunta de administrador y aceptación con el propietario.

## Prueba conjunta

1. Recargar el demo sin Reiniciar. Como propietario, comprobar tarjeta de JE y abrir su ficha/logo/contacto/vigencia. Entrar a JE con empresa y usuario indicados y la contraseña ya acordada.
2. Verificar inventario vacío de JE. Desde administrador crear un producto, ingresar existencias y comprobar que no se afecta Moto Norte/Sur.
3. En celular comprobar contenido ancho, barra inferior y Más; en PC comprobar barra lateral. Cambiar módulos conservando el carrito.
4. Agregar producto y servicio desde Taller, abrir/cerrar cliente opcional y cobrar una sola vez. Imprimir/PDF 80/58 mm, verificar logo, importes y legibilidad. Probar un ticket largo con la impresora real.
5. Desde Perfil de vendedor o administrador, crear soporte. Volver al propietario, abrir campana de esa empresa, responder y resolver. Volver al remitente y comprobar contador, respuesta e historial.
6. Comprobar que un vendedor no ve solicitudes de otro y otra empresa no ve el ticket. Mantener autorización de administrador para anulaciones y devoluciones.

Las APIs externas y la instalación compartida definitiva continúan en la fase posterior. En la demostración los datos permanecen aislados por navegador; no se usa como inventario real. P05–P10 siguen abiertos.
