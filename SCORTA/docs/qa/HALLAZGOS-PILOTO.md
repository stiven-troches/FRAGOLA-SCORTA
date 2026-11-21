# Registro de hallazgos del piloto (QA-05)

Un hallazgo es todo lo que no salió como dice el guion o lo que confunde a quien usa el
sistema. Se registra **el mismo día**. Un hallazgo solo se cierra cuando tiene su prueba de
regresión automática, o una justificación de por qué no es posible automatizarla (QA-06).

## Gravedad

| Gravedad | Definición | Ejemplos | Plazo de corrección |
|---|---|---|---|
| **Crítica** | Pérdida, duplicación o corrupción de datos; dinero mal calculado; una empresa ve datos de otra; no se puede vender. | Venta duplicada al reintentar, stock negativo, total distinto al cobrado, respaldo que no restaura | Detener el piloto si afecta a datos. Corregir en 24 h |
| **Alta** | Una función principal falla sin una alternativa razonable, o el cierre de caja no cuadra sin explicación. | No se puede devolver, el comprobante no imprime, WhatsApp abre otra venta | Antes del siguiente día de piloto |
| **Media** | Falla con alternativa razonable, o un error de presentación que puede llevar a error humano. | Hay que recargar para ver el stock, un mensaje confuso, un botón cortado en el celular | Antes del lanzamiento |
| **Baja** | Detalle cosmético o mejora que no afecta al resultado. | Alineación, ortografía, un color | Cuando haya tiempo |

## Plantilla (copiar por hallazgo)

```
### H-AAAA-MM-DD-NN — <título corto>
- Fecha y hora:
- Quién lo encontró:
- Guion / pantalla: (G1…G9)
- Equipo / sistema / navegador:
- Pasos para reproducir:
  1.
  2.
- Resultado esperado:
- Resultado obtenido: (capturas o vídeo si es posible)
- Gravedad: crítica | alta | media | baja
- Responsable de cerrarlo:
- Estado: abierto | en corrección | corregido | verificado | descartado
- Prueba de regresión asociada: tests/… o browser-checks/… (archivo y nombre de la prueba)
- Fecha de cierre y versión:
```

## Tablero

| ID | Fecha | Quién | Guion | Título | Gravedad | Responsable | Estado | Prueba de regresión |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## Hallazgos de QA previos al piloto

| ID | Fecha | Quién | Título | Gravedad | Estado | Prueba |
|---|---|---|---|---|---|---|
| H-2026-11-21-01 | 2026-11-21 | Agente QA | Una devolución en D+1 de una venta de D se descuenta del día D (regla documentada). El efectivo entregado en D+1 no aparece en el esperado de D+1, así que el conteo físico del cajón de D+1 mostrará una diferencia | Media (riesgo operativo en G6) | Corregido (BE-15, 2026-11-21): la caja descuenta la devolución el día en que se paga; el reporte de ventas sigue en la fecha original | `tests/qa-criticas.test.mjs` › QA-03c, `tests/caja-cierre.test.mjs` |
| H-2026-11-21-02 | 2026-11-21 | Agente QA | `roundMoney` pierde precisión por encima de ~9e13 (fuera del límite de 1e12 de `moneyAmount`) | Baja | Aceptado | `tests/qa-criticas.test.mjs` › QA-03e |
| H-2026-11-21-03 | 2026-11-21 | Agente QA | Al validar un respaldo truncado que estaba en modo WAL, SQLite deja archivos `-wal`/`-shm` junto al archivo de ORIGEN (el destino no se toca) | Baja | Abierto | `tests/qa-criticas.test.mjs` › QA-03d |
