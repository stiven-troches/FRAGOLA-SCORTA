# Fragola Prenota v6.4: guardado automático, copias de seguridad y correcciones

Archivo: `fragola-prenota-v6-4.html` (idéntico a `index.html`). Parte de la v6.3; la v6.3 original no se modificó.

## Qué cambió

### Nuevo: los datos ya no se pierden al recargar
- **Guardado automático** en el navegador (localStorage). Guarda todos los negocios, citas, clientes, equipo, servicios y el registro.
- **La sesión no se guarda** a propósito: al recargar hay que volver a ingresar el PIN.
- Si el almacenamiento está **lleno** (por ejemplo, por muchas fotos) o **bloqueado** (modo privado), aparece un aviso rojo. No se pierde nada sin avisar.
- Si los datos guardados están **dañados**, se guarda una copia aparte (`fragola-prenota:v1:danado`), se empieza con un negocio vacío y se avisa.
- **Varias pestañas abiertas**: los cambios de una pestaña aparecen en las demás, sin sobrescribirse entre ellas.

### Nuevo: Negocio → «Datos y copias de seguridad»
- Estado del guardado (última hora y tamaño usado).
- **Descargar copia de seguridad** (.json). Pide el PIN porque contiene datos personales y queda en el registro.
- **Restaurar copia**: pide el PIN, valida el archivo, muestra cuántos negocios y citas trae y pide confirmación antes de reemplazar. Los datos del archivo se normalizan antes de usarlos.
- **Borrar todos los datos**: PIN más confirmación.

### Correcciones
| Problema | Corrección |
|---|---|
| La **anticipación mínima** solo se aplicaba al día de hoy. Con 24 h configuradas, a las 11 p. m. se ofrecían las 9 a. m. de mañana. | Se calcula con fecha y hora completas, aunque cruce la medianoche. |
| Si el cliente se demoraba en el paso «Tus datos», podía **confirmar una hora que ya había pasado**. | Se vuelve a comprobar al confirmar. |
| Al **reprogramar**, el cliente podía guardar después del plazo de cancelación si tenía la pantalla abierta. | Se comprueba el plazo y la anticipación al guardar. |
| El botón **«Ver»** de Clientes no tenía icono (el icono `eye` no existía). | Se agregó el icono. |
| Apertura y cierre del negocio aceptaban **decimales** (9,5). | Solo se aceptan horas enteras. |
| La tecla **Escape** en un diálogo sobre el perfil de un empleado cerraba también el perfil. | Vuelve al perfil. |

## Pruebas (Chromium real, con Playwright)
27/27 pruebas OK, sin errores en la consola:
- Persistencia: datos de demostración, cambio de precio sin redibujar y reserva hecha con clics sobreviven al recargar; la sesión no se guarda; las fechas del registro se recuperan bien.
- Copias: descarga, borrado y restauración desde los botones; un archivo inválido se rechaza; los datos dañados se tratan como se describe arriba.
- Pestañas: el cambio llega a la otra pestaña y no se reescribe en bucle.
- Anticipación cruzando la medianoche; Escape; horas con decimales; las 8 secciones de administrador y las vistas Día/Semana/Mes se dibujan sin errores.

Las suites de regresión de la v6.3 (F1–F4, Equipo y Clientes) no estaban entre los archivos recibidos, así que **no se volvieron a ejecutar**.

## Límites
- Solo Chromium: **no probado en celulares reales, Safari ni Firefox**.
- localStorage suele admitir unos 5 MB. Con fotos (hasta 150 KB cada una) caben unos 25–30 empleados con foto.
- Sigue siendo un prototipo: los PIN y el código 123456 no protegen nada. Los datos quedan en texto plano en el navegador.
- Pendiente: **Fase 4 (servidor)**, que necesita decidir lenguaje, hosting y base de datos.
