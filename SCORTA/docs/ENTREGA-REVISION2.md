# SCORTA — entrega de revisión 2

Fecha: 19 de noviembre de 2026 (America/Bogota).

El propietario autorizó implementar la nueva lista de ajustes con foco en interfaz y experiencia. Esta entrega conserva el motor multiempresa y diferencia claramente código funcional de vistas previas que aún requieren conexión o revisión jurídica.

## Cambios de uso

- Sesión recordada durante un máximo absoluto de 30 días desde el login. Se conserva al apagar el equipo o reiniciar el servidor, con comprobación de empresa, cuenta, contrato y bloqueos en cada solicitud.
- Información real en SQLite del servidor; cookie de sesión segura en el navegador. La demo estática conserva la excepción ficticia: IndexedDB por navegador y un token opaco de acceso en localStorage, nunca su contraseña.
- Vendedor con tres módulos: Nueva venta, Inventario y Taller. Inventario permite buscar/consultar por categorías y cargar productos; Taller carga servicios con placa, trabajo, mecánico e importe libre; Nueva venta muestra el carrito común y realiza el cobro. El administrador conserva los seis módulos.
- Un único botón de Registrar pago y renovar en Pagos y renovaciones. La fecha elegida para un pago tardío ajusta su nuevo período; un pago anticipado conserva días contratados.
- Paleta blanca, negra y amarilla; barra negra y botones amarillos con texto negro.

## Flujos preparados y conexiones aplazadas

- Avisos de contrato por WhatsApp: vistas previas de recordatorio tres días antes y confirmación tras el pago. Una renovación sustituye el cálculo del recordatorio anterior. No hay envío automático ni confirmación ficticia de entrega.
- Recuperar contraseña: flujo de vista previa por empresa/usuario, correo verificado, enlace de 30 minutos/único uso y nueva contraseña. Los correos pueden guardarse por cuenta pero no se verifican ni envían enlaces todavía. El restablecimiento administrativo real ya existente se conserva.
- Documentos legales: borradores de contrato, términos y privacidad, casillas sin marcar y constancia de ejemplo para revisar la experiencia. No se firma, no se persiste una aceptación ni se activa un bloqueo legal del primer ingreso. La formalización requiere contenido final y revisión jurídica.

El envío manual del comprobante de una venta por WhatsApp es distinto del aviso automático de vencimiento del contrato: el primero mantiene la confirmación humana existente; el segundo sigue sin conexión.

## Logo oficial

No se ha localizado el archivo original utilizable del nuevo logo FRAGOLA SCORTA; las imágenes visibles en el chat no están disponibles como ese archivo en el entorno. No se ha recreado el símbolo, su tipografía ni sus colores. Brand.jsx está preparado para cargar el original sin modificarlo desde src/assets/fragola-scorta-logo y ajustar solo su tamaño proporcional. Mientras falte, SCORTA se presenta como nombre neutro de la aplicación, no como logo oficial. Ver [LEEME-LOGO.md](../src/assets/LEEME-LOGO.md).

## Responsables y evidencia

`review2_seller`: vendedor/carrito/paleta. `review2_owner`: botón de pago, vistas previas de avisos y correos. `review2_sessions`: persistencia de sesión, cookie y datos de correo. `review2_legal_ui`: documentos de vista previa. `review2_qa`: regresión y comprobaciones estáticas. Coordinación: login/recuperación, marca, integración, documentación y publicación.

La comprobación final aprobó **86/86 pruebas**, sin fallos ni omisiones, y las compilaciones de aplicación y demo. Los comandos y detalles se registran en [QA-REVISION2.md](QA-REVISION2.md). Las 72 pruebas de la entrega anterior no se presentan como conteo actual. SSR verifica estructura; no sustituye recorridos interactivos ni revisión en celulares/PC físicos. La infraestructura de navegador requerida no está disponible en esta sesión.

## Publicación y próximos pasos

Enlace privado existente: https://fragola-scorta-demo.safeturnip2.chatgpt.site.

**Publicación de revisión 2 pendiente de confirmación.**

La revisión visual conjunta, los dispositivos reales y la puesta en marcha P05–P10 siguen abiertos: alojamiento definitivo, HTTPS, cuentas reales, respaldo externo/restauración, inventario conciliado y piloto. La demo no es un almacén compartido entre equipos; sus comprobantes solo se abren donde existen sus datos locales. La integración de envíos automáticos/correo y la formalización legal quedan para la fase posterior acordada.
