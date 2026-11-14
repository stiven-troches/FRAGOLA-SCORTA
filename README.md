# FRAGOLA SCORTA

Aplicación de inventario, compras, ventas y taller para almacenes de accesorios y repuestos de moto.

El proyecto de SCORTA está en **[`SCORTA/`](SCORTA/)**. Ejecuta los comandos desde esa carpeta; los archivos de PRENOTA que permanecen en la raíz pertenecen a otro proyecto.

## Iniciar una copia local

Con Node.js 24:

```sh
cd SCORTA
npm ci
npm run build
npm start
```

Abre `http://localhost:3000`. La copia local sin cuentas permite probar como administrador únicamente desde el propio equipo. Para uso compartido configura usuarios y HTTPS como explica [la guía de SCORTA](SCORTA/LEEME.md).

## Desarrollo y validación

```sh
cd SCORTA
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

Los datos locales se guardan en `SCORTA/data/`; no deben añadirse al repositorio.

Consulta la [entrega y sus capturas](SCORTA/docs/ENTREGA.md), el [plan de experiencia de uso](SCORTA/docs/PLAN-PRODUCTO.md) y la [guía de instalación y respaldo](SCORTA/LEEME.md). SCORTA no incluye caja, contabilidad ni facturación electrónica.
