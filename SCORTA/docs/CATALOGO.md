# Catálogo público de cada negocio

Desde **Inventario → Mi catálogo**, el administrador configura el WhatsApp, los colores y la presentación, revisa la vista previa y activa **Publicar catálogo**. También puede configurarlo el propietario desde la ficha de la empresa. El logo y el nombre provienen de esa ficha. Los colores pueden sugerirse a partir del logo y editarse manualmente.

El enlace compartible es `/catalogo/<código-de-empresa>`, en el mismo dominio de la aplicación. No requiere cuenta. Se muestran foto, nombre, descripción, referencia, marca, categoría y precio de venta de los productos con existencias. No se publican cantidades, costos, historial interno ni datos personales de clientes. Los catálogos empiezan desactivados; los de empresas suspendidas, vencidas o cuyo contrato no comienza no se sirven públicamente.

El cliente navega por categorías, busca productos, consulta detalles y guarda un carrito en su navegador, separado por negocio. **Comprar por WhatsApp** comprueba nuevamente productos, cantidades y precios en el servidor y abre el número de la empresa con el mensaje preparado. El cliente debe enviarlo. No se reserva inventario, registra una venta ni cobra dinero. La venta confirmada se registra en SCORTA por el procedimiento habitual.

La descripción se edita en la ficha del producto. Las fotos se cargan desde archivos o se toman con cámara, con confirmación previa y reducción automática a menos de 500 KB. La cámara requiere HTTPS o localhost y permiso del navegador.

El código se despliega con el proceso habitual de Render desde `SCORTA/`: `npm ci && npm run build`, seguido de `npm start`. No hay una base de datos adicional ni migraciones destructivas; la configuración del catálogo se guarda con la empresa en la plataforma existente. El enlace público queda disponible cuando el despliegue termina y el negocio publica su catálogo.
