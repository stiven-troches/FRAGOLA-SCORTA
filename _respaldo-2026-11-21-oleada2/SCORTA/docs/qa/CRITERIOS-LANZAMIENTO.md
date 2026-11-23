# Criterios de lanzamiento de SCORTA (QA-01)

SCORTA sale a producción (clientes pagando) solo cuando **todos** los criterios están en
"Cumple", con su evidencia enlazada. Un criterio sin evidencia cuenta como "No cumple".
La decisión la firman el dueño y QA.

| # | Criterio | Cómo se mide | Evidencia | Estado |
|---|---|---|---|---|
| L1 | **Todas las tareas 🔴 de `PENDIENTES-SCORTA.md` cerradas** | Ninguna fila 🔴 sin cerrar. Cada cierre tiene una prueba automática o un registro de verificación manual | Lista de IDs 🔴 con el enlace a su commit o prueba | ☐ |
| L2 | **Piloto aprobado** | En el piloto ([GUIONES-PILOTO.md](GUIONES-PILOTO.md)): **10 cierres de caja seguidos con 0 diferencias inexplicables** y **0 hallazgos críticos o altos abiertos** en [HALLAZGOS-PILOTO.md](HALLAZGOS-PILOTO.md) | Hoja de cierres del piloto y registro de hallazgos | ☐ |
| L3 | **Restauración probada** | Se toma un respaldo real (`platform-backup.mjs save`), se restaura en un equipo limpio (`restore … --offline`), se inicia sesión y se comparan conteos (empresas, productos, ventas, total vendido del mes) con el original. Diferencia 0. Tiempo total anotado | Acta con fecha, tamaño del respaldo, tiempo de restauración y conteos antes y después | ☐ |
| L4 | **CI verde** | El último commit de la rama de lanzamiento pasa `npm test` (node:test) y las suites Playwright (`npm run test:ui`, `npm run test:demo:ui`) en la CI, sin pruebas omitidas salvo las `todo` documentadas | Enlace a la ejecución de CI | ☐ |
| L5 | **Prueba de humo verde en producción** | `npm run smoke -- <url-producción>` termina sin errores justo después del despliegue | Salida de la prueba de humo, guardada en el registro de versiones ([REGRESION-DESPLIEGUE.md](REGRESION-DESPLIEGUE.md)) | ☐ |

## Definiciones

- **Diferencia inexplicable:** diferencia entre lo esperado y lo contado en un cierre de caja
  que, tras revisar ventas, devoluciones y anulaciones del día, nadie puede atribuir a una
  operación concreta. Una diferencia explicada (por ejemplo, un error de conteo corregido)
  no rompe la racha, pero se anota.
- **Racha de 10 cierres:** 10 cierres consecutivos de la misma empresa piloto. Una diferencia
  inexplicable reinicia el conteo a 0.
- **Fallo crítico o alto:** según la escala de [HALLAZGOS-PILOTO.md](HALLAZGOS-PILOTO.md).
- **Prueba `todo`:** prueba que documenta un bug conocido (`{todo:'BUG: …'}`). Se permite en
  CI solo si el bug no es crítico ni alto y tiene responsable y fecha.

## Bloqueos automáticos (no se lanza aunque lo demás cumpla)

- Cualquier pérdida o duplicación de ventas, stock negativo o dato de una empresa visible para otra.
- Un respaldo que no se puede restaurar.
- Un fallo crítico abierto, aunque tenga solución temporal.

## Firma

| Rol | Nombre | Fecha | Decisión |
|---|---|---|---|
| Dueño | | | ☐ Lanzar ☐ No lanzar |
| QA | | | ☐ Lanzar ☐ No lanzar |
