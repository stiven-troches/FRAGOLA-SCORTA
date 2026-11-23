# Guiones del piloto (QA-04)

Cada guion lo ejecuta una persona del almacén piloto con datos reales del día. Quien observa
anota el resultado en la tabla de ejecución (sección final). Si algo falla, se abre un
hallazgo en [HALLAZGOS-PILOTO.md](HALLAZGOS-PILOTO.md) con el ID del guion.

**Regla general de "pasa":** el resultado esperado se cumple completo, sin recargar la página,
sin ayuda de soporte y sin pasos fuera del guion. Un error de la persona (tecleó mal) no
cuenta como falla si el sistema lo indicó con claridad y permitió corregirlo.

---

## G1. Venta simple

**Pasos**
1. Entrar como vendedor.
2. Buscar 2 productos por nombre o referencia y agregarlos (uno con cantidad 2).
3. Elegir el medio de pago **efectivo** y pulsar **Registrar venta**.

**Resultado esperado**
- Aparece el *Detalle de venta* con el número, los productos, las cantidades y el total correcto.
- Las existencias de ambos productos bajan exactamente en las unidades vendidas (Inventario).
- La venta aparece en *Mis ventas y servicios*.

**Pasa / falla:** pasa si el total coincide al peso con la suma calculada a mano y el stock baja
exactamente. Falla si aparece una venta duplicada, si el total difiere o si el stock no cambia.

## G2. Venta con servicio (taller)

**Pasos**
1. En **Taller**, escribir la placa, el trabajo realizado, el mecánico y el valor de la mano de obra, y luego **Agregar al carrito**.
2. Agregar 1 producto desde Inventario.
3. Cobrar con **transferencia**.

**Resultado esperado:** la venta muestra productos y mano de obra por separado, la placa y el
mecánico. El trabajo queda en el historial de la placa.
**Pasa / falla:** pasa si total = productos + mano de obra y la placa aparece en *Historial
de cliente o moto*. Falla si falta la mano de obra, el mecánico o la placa.

## G3. Compra (ingreso de mercancía)

**Pasos:** el administrador entra en **Compras**, pulsa **Ingresar mercancía**, escribe el
proveedor, agrega 2 productos con su cantidad y costo, y pulsa **Registrar compra**.
**Resultado esperado:** el stock sube en las cantidades recibidas y la compra aparece en el listado con su total.
**Pasa / falla:** pasa si stock nuevo = stock anterior + cantidad para cada producto. Falla si
la compra se registra dos veces o el stock no cuadra.

## G4. Devolución parcial

**Pasos:** el administrador abre una venta de hoy con 2 o más unidades, pulsa **Devolver /
anular con autorización**, elige **Devolver productos parcialmente**, indica 1 unidad y el
motivo, y confirma.
**Resultado esperado:** la venta muestra "Devuelto: 1 unidad", el total vigente baja y el stock sube en 1.
**Pasa / falla:** pasa si total vigente = original − precio de la unidad y stock +1. Falla si
el vendedor puede hacerlo sin el administrador, o si al repetir la confirmación devuelve dos veces.

## G5. Anulación

**Pasos:** el administrador abre una venta, elige **Anular venta completa**, escribe el motivo y confirma.
**Resultado esperado:** la venta queda marcada **Anulada**, todo el stock vuelve y el reporte del día la descuenta.
**Pasa / falla:** pasa si el reporte de ventas del día baja exactamente el total de la venta.
Falla si la venta anulada sigue sumando o si el stock no vuelve.

## G6. Cierre de caja

**Pasos**
1. Al terminar el día, el administrador abre **Resumen general → Administración → Cierre de caja**.
2. Cuenta el efectivo del cajón y revisa los totales de transferencias y datáfono.
3. Escribe lo recibido por cada medio de pago y pulsa **Registrar cierre**.

**Resultado esperado:** el sistema muestra lo esperado, lo recibido y la diferencia por medio de pago, y guarda el cierre.
**Pasa / falla:** pasa si la diferencia es 0 o si toda diferencia se explica con una operación
concreta (se anota). **Una diferencia inexplicable es falla** y reinicia la racha de 10
cierres de [CRITERIOS-LANZAMIENTO.md](CRITERIOS-LANZAMIENTO.md).
> Regla vigente: una devolución se resta del día **de la venta original**, no del día en que
> se entrega el dinero. Si se devuelve efectivo de una venta de otro día, anótalo en la observación.

## G7. Importación de productos

**Pasos:** el administrador descarga la plantilla y carga un CSV o Excel con 20 productos
(incluidas referencias con ceros a la izquierda, por ejemplo `00123`) en **Inventario → Opciones → Importar productos CSV**.
**Resultado esperado:** se muestra una vista previa, se importan los 20 y las referencias conservan los ceros.
**Pasa / falla:** pasa si los 20 productos aparecen con su precio y stock correctos. Falla si se
pierde una fila, se pierden los ceros o se acepta un duplicado sin avisar.

## G8. Impresión 80 mm y 58 mm

**Pasos:** desde el *Detalle de venta* de una venta con 3 o más líneas, imprimir en la
impresora térmica del almacén con el formato **80 mm** y luego con **58 mm**.
**Resultado esperado:** el ticket sale completo (logo, NIT, líneas, total, medio de pago y la leyenda "No es factura electrónica"), sin cortes ni hojas en blanco.
**Pasa / falla:** pasa si todas las líneas y el total se leen en papel. Falla si se corta una
línea, el total queda fuera o salen hojas en blanco. Anotar marca y modelo de la impresora.

## G9. Envío por WhatsApp

**Pasos:** desde el *Detalle de venta*, pulsar **Enviar por WhatsApp** a un número de prueba del almacén.
**Resultado esperado:** se abre WhatsApp con el mensaje y el enlace del comprobante. El enlace abierto en otro teléfono muestra el ticket sin datos privados (costos, otras ventas).
**Pasa / falla:** pasa si el enlace abre el comprobante correcto en otro teléfono. Falla si el
enlace no abre, muestra otra venta o expone costos.

---

## Matriz de dispositivos

Cada guion G1 a G9 se ejecuta al menos una vez en cada fila obligatoria.

| Dispositivo | Sistema | Navegador | Obligatorio | Guiones mínimos |
|---|---|---|---|---|
| Android de gama baja (≤ 3 GB RAM) | Android 10 o superior | Chrome | Sí | G1, G2, G4, G9 |
| iPhone | iOS 16 o superior | Safari | Sí | G1, G2, G8 (PDF), G9 |
| Tablet (Android o iPad) | — | Chrome / Safari | Sí | G1, G3, G6 |
| PC con Windows | Windows 10 u 11 | Edge y Chrome | Sí | G1 a G8 |
| Impresora térmica del almacén | — | Desde la PC o el celular | Sí | G8 |

## Registro de ejecución

| Fecha | Guion | Persona | Equipo (marca y modelo) | Sistema y versión | Navegador y versión | Red (wifi/datos) | Resultado (pasa/falla) | Tiempo (s) | Hallazgo (ID) |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |
