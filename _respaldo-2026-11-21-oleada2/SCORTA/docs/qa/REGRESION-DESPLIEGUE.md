# Regresión antes de cada despliegue (QA-02)

Se completa **en cada despliegue** a producción, sin excepciones. Si un punto falla, no se
despliega, o se vuelve atrás según el plan de la sección 5.

## 1. Antes de desplegar

- [ ] La CI del commit que se va a desplegar está **verde**: `npm test`, `npm run test:ui` y `npm run test:demo:ui`.
- [ ] No hay pruebas nuevas marcadas `todo` o `skip` sin anotarlas en el registro de hallazgos.
- [ ] Revisé el diff contra la versión en producción y encontré cambios de esquema o de formato del estado: ☐ No ☐ Sí (en ese caso, respaldo obligatorio y plan de vuelta atrás probado).
- [ ] **Respaldo previo** tomado y verificado (`node platform-backup.mjs save <db> <carpeta>`). Anoto el archivo en el registro.
- [ ] Las variables de entorno de producción no cambiaron, o el cambio está anotado (`SCORTA_PUBLIC_URL`, `SCORTA_CLIENT_IP_HEADER`, contraseña del propietario…).

## 2. Staging

- [ ] Desplegado en staging el mismo commit.
- [ ] `npm run smoke -- <url-staging>` en verde.
- [ ] **Venta de prueba en staging** con la empresa de pruebas:
  - [ ] Venta de 2 productos + 1 servicio, pago en efectivo, y el comprobante se abre.
  - [ ] Devolución parcial de 1 unidad, y el stock vuelve.
  - [ ] Reporte del día: los totales cuadran con la venta menos la devolución.
  - [ ] En celular (Chrome Android o Safari iPhone): iniciar sesión, vender y ver el comprobante.

## 3. Producción

- [ ] Desplegado en producción.
- [ ] `npm run smoke -- <url-producción>` en verde (guardar la salida).
- [ ] Inicio de sesión del propietario y lista de empresas visibles.
- [ ] `/healthz` (o la ruta de salud configurada) responde OK.
- [ ] Revisión de los registros en los primeros 15 minutos: sin errores `INTERNAL_ERROR` nuevos.
- [ ] La demo pública sigue funcionando ([REVISION-DEMO.md](REVISION-DEMO.md)).

## 4. Registro de versiones (una fila por despliegue)

| Fecha y hora | Versión / commit | Quién | CI | Humo staging | Venta staging | Humo prod | Respaldo previo | Resultado |
|---|---|---|---|---|---|---|---|---|
| | | | ☐ | ☐ | ☐ | ☐ | | ☐ OK ☐ Vuelta atrás |

## 5. Plan de vuelta atrás

**Disparadores:** la prueba de humo falla en producción, aparece un error 500 repetido, se
pierde o duplica una venta, o un cliente ve datos de otra empresa.

1. Volver a desplegar el commit anterior anotado en el registro (Render: *Rollback* a la versión previa).
2. Si el estado cambió de formato o hay datos dañados: detener el servicio, restaurar el
   respaldo previo con `node platform-backup.mjs restore <respaldo> <db> --offline` y arrancar.
3. Ejecutar `npm run smoke -- <url-producción>` otra vez.
4. Avisar a las empresas afectadas si hubo operaciones entre el despliegue y la vuelta atrás
   (se pierden si se restauró el respaldo) y anotar el hallazgo con gravedad crítica.
5. Escribir en el registro qué falló y la prueba de regresión que lo cubrirá (QA-06).

> Nota: mientras SCORTA esté en el plan gratuito de Render sin disco persistente, cada
> despliegue reinicia los datos. El respaldo del paso 1 y la restauración son obligatorios.
