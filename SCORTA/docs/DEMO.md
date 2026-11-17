# Demo de SCORTA con inventario ficticio

La demo utiliza la interfaz de SCORTA y el mismo motor de inventario que el servidor. Incluye 24 productos ficticios de accesorios de moto, con existencias suficientes, pocas unidades y agotados; también contiene compras, ventas y trabajos de ejemplo. Los importes están expresados en pesos colombianos.

Permite navegar, agregar productos, registrar compras y ventas, ajustar existencias, consultar movimientos, devolver o anular operaciones y probar el taller. No necesita cuentas de prueba ni una base de datos del almacén.

## Abrir una copia local

Con Node.js 24, desde `SCORTA/`:

```sh
npm ci
npm run build:demo
npm run preview:demo
```

Abrir `http://127.0.0.1:4173`. Mantener el comando activo mientras se utiliza la demo. `dist-demo/index.html` y sus recursos son la compilación estática que se puede alojar mediante HTTP/HTTPS; no debe abrirse el HTML directamente como archivo.

## Recorrido sugerido

1. En Inicio, abrir **Nueva venta**, buscar un casco y agregar una unidad. Revisar el total y guardar.
2. En Inventario, comprobar la existencia restante y consultar los movimientos del producto.
3. Crear un producto con **Nuevo producto** y una cantidad inicial ficticia.
4. En Compras, registrar mercancía recibida para ese producto y verificar el aumento.
5. En la ficha del producto, usar **Ajustar existencias** con un motivo de ejemplo.
6. Recargar la página y comprobar que los datos siguen disponibles.
7. Usar **Reiniciar demo** y confirmar para volver a los productos y operaciones iniciales.

## Datos de la demostración

IndexedDB guarda los cambios en este navegador y perfil. Otro navegador o equipo tiene su propia copia; esta demo no sirve como inventario compartido del almacén. Borrar los datos del sitio elimina las pruebas realizadas. Desde Opciones se pueden exportar los datos ficticios como JSON; ese archivo no es el respaldo completo de producción ni contiene cuentas.

El reinicio solo modifica el almacenamiento de esta demo. Descarta las operaciones de prueba y los formularios abiertos; las otras pestañas deben actualizarse antes de guardar. No introducir información real del negocio en esta copia.

## Validación y publicación

```sh
npm test
npm run build
npm run build:demo
npm run test:demo:ui
```

La última orden requiere un entorno con ejecución de navegador disponible y Chromium de Playwright instalado, o `CHROMIUM_PATH` apuntando a un ejecutable compatible. El servidor de estas pruebas sirve exclusivamente los archivos estáticos de la demo y rechaza solicitudes API reales.

El 16 de noviembre de 2026 (UTC) pasaron 44 pruebas de Node y ambas compilaciones. IndexedDB se probó con `fake-indexeddb`; los escenarios de navegador de la demo aún no se ejecutaron. La demo se publicó el 17 de noviembre de 2026 (UTC): [https://fragola-scorta-demo.safeturnip2.chatgpt.site](https://fragola-scorta-demo.safeturnip2.chatgpt.site). El acceso es privado desde la cuenta propietaria. El servicio confirmó la publicación de la versión `d41c87319b69b3c9facc726eeab9666cae7713b6`, preparada desde el código SCORTA `356dd9780dc0935743122b6f09f53a40873aca79`. La revisión visual de la demo alojada sigue pendiente. Véase [QA.md](QA.md).
