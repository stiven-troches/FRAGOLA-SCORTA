# Revisión de la demo pública después de cada versión (QA-13)

Duración: unos 10 minutos. Se hace en una ventana de incógnito, primero en la PC y luego en
un celular. Las fallas se anotan en el registro de versiones de [REGRESION-DESPLIEGUE.md](REGRESION-DESPLIEGUE.md).

- [ ] La URL de la demo abre en menos de 5 s y muestra la marca correcta (logo y nombre), sin errores en la consola.
- [ ] El aviso de "demo / datos ficticios" se ve sin desplazarse.
- [ ] **Propietario:** se ve la lista de empresas de demostración y no aparecen contraseñas en las tarjetas.
- [ ] **Administrador:** hay productos con stock, se registra una venta con un producto y una mano de obra, y el comprobante se abre (80/58 mm).
- [ ] **Vendedor:** no ve Compras, Movimientos ni Resumen general, y puede vender.
- [ ] Al recargar en mitad de una venta, el carrito se recupera y se cobra una sola vez.
- [ ] Devolución parcial y anulación funcionan con el administrador.
- [ ] Los reportes y el Excel se descargan y se abren en Excel o LibreOffice.
- [ ] "Restablecer demo" (si existe) vuelve a los datos iniciales.
- [ ] En el celular (360–390 px de ancho): la navegación inferior tiene 4 pestañas y no hay desplazamiento horizontal.
- [ ] Ningún enlace lleva a la plataforma real ni pide credenciales reales.
- [ ] Los textos comerciales (precios, contacto, WhatsApp) son los vigentes.
- [ ] La CI de la demo (`npm run test:demo:ui`) está en verde para este commit.

| Fecha | Versión | Quién | PC | Celular | Observaciones |
|---|---|---|---|---|---|
| | | | ☐ | ☐ | |
