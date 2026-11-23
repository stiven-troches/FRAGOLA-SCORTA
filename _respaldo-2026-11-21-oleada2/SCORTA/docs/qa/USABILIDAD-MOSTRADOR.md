# Prueba de usabilidad en mostrador (QA-11)

**Objetivo:** un vendedor real registra una venta de **3 productos distintos** en **menos de
30 segundos** usando su propio equipo, en el mostrador y con la presión normal de atención.

## Participantes y preparación

- 5 vendedores como mínimo (idealmente de 2 almacenes), con al menos 1 que nunca haya usado SCORTA.
- El equipo real del mostrador (PC, tablet o celular) y la red real del almacén.
- La empresa piloto con su catálogo real, con 3 productos elegidos por el observador para
  cada intento: uno por nombre, uno por referencia y uno por código de barras (si hay lector).
- Una explicación previa de 2 minutos como máximo. No se ayuda durante el intento.
- Un cronómetro (o una grabación de pantalla con la hora).

## Protocolo

1. El vendedor inicia sesión y deja abierta la pantalla **Nueva venta** con el carrito vacío.
2. El observador entrega una tarjeta con los 3 productos, sus cantidades (1, 2 y 1) y el medio de pago.
3. **Inicio del tiempo:** cuando el vendedor toca la pantalla o el teclado por primera vez.
4. **Fin del tiempo:** cuando aparece el *Detalle de venta* (venta registrada).
5. Cada vendedor hace 3 intentos con productos distintos. Se anotan los 3 tiempos.
6. Al final se hacen 2 preguntas: "¿Qué fue lo más lento?" y "¿Qué te confundió?".

## Qué se anota

| Fecha | Vendedor (alias) | Experiencia previa (sí/no) | Equipo y navegador | Intento | Tiempo (s) | Errores (producto o cantidad equivocados) | Ayudas pedidas | Comentario |
|---|---|---|---|---|---|---|---|---|
| | | | | 1 | | | | |

## Criterio de aprobación

- **Mediana de los 3 intentos < 30 s** para al menos el 80 % de los vendedores.
- **Ningún intento termina en una venta con el producto o la cantidad equivocados** sin que el vendedor lo note antes de cobrar.
- Ninguna ayuda pedida en el tercer intento.

Si no se cumple, cada obstáculo se registra como hallazgo de gravedad **media** (o **alta**
si provoca ventas equivocadas) en [HALLAZGOS-PILOTO.md](HALLAZGOS-PILOTO.md) y la prueba se
repite después de la corrección.

## Variables a observar

- Tiempo de búsqueda de cada producto (nombre, referencia o código de barras).
- Toques o clics para cambiar una cantidad.
- Si el vendedor tuvo que desplazarse en el celular para encontrar el botón **Registrar venta**.
- Retrasos de red: si el botón queda en "Registrando…" más de 2 s, anotarlo aparte.
