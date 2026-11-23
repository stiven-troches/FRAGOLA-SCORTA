# Moto Central Demo

El servidor crea esta empresa ficticia automáticamente una sola vez al arrancar con la plataforma configurada. Su semilla está en `test-company.mjs` y sus fotografías en `public/test-shop/`, dentro del repositorio. No necesita descargar imágenes de terceros.

<<<<<<< HEAD
En la web publicada solo aparece después de subir estos archivos a `main` y de que Render termine el despliegue.

=======
>>>>>>> 35fa6770eeb6d71f7cda7e999d89b5639d8e9fa2
Accesos de prueba, exclusivos de esta empresa:

| Campo | Valor |
| --- | --- |
| Empresa | Moto Central Demo |
| Administrador | demo.admin |
| Vendedor | demo.vendedor |
| Contraseña inicial de ambas cuentas | Demo.MotoCentral.2026 |
| Catálogo público | `/catalogo/moto-central-demo` |

Si el nombre o código ya existe, la semilla elige un sufijo libre. El propietario puede consultar la empresa creada desde su panel y acceder mediante soporte.

Incluye logo, 24 productos con fotos ilustrativas generadas con IA, seis categorías, costos, precios de venta, precios para mecánico y mayorista, referencias, códigos, tallas o modelos, descripción, garantías, existencias y mínimos. Dos productos agotados permiten comprobar que el catálogo los oculta. También hay una compra, tres ventas y sus movimientos ficticios.

El catálogo comienza publicado. El WhatsApp queda vacío: el propietario o el administrador puede asignar **su propio número de pruebas** desde Configurar catálogo. Hasta entonces, el carrito se puede explorar, pero comprar indica que falta configurar el número.

Estas credenciales están publicadas intencionalmente para probar datos ficticios y nunca dan permisos de propietario ni acceso a otra empresa. No cargues información real en esta empresa de pruebas. El propietario puede cambiar sus contraseñas, suspenderla o eliminarla.

Los siguientes arranques no restablecen productos, ventas, fotos, contraseñas ni ajustes de la empresa; tampoco la recrean después de eliminarla. `SCORTA_TEST_COMPANY=0` evita crear la empresa en un entorno nuevo y no borra una ya existente.
