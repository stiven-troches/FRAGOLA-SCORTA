# Operación y recuperación de SCORTA

Estos procedimientos están preparados para revisión; no se ha configurado ni desplegado un servidor externo.

## Respaldos programados

Con Node 24, prepara un directorio de respaldos accesible solo al usuario del servicio. Ejecuta primero el comando manualmente. Ejemplo de cron diario a las 02:00 del servidor (ajusta rutas, zona horaria y ruta de Node):

```cron
0 2 * * * DATA_DIR=/srv/scorta/data /usr/bin/node /srv/scorta/backup.mjs /srv/scorta/backups --keep 30 >> /srv/scorta/backup.log 2>&1
```

Revisa el resultado y la fecha de la copia más reciente cada día. El comando termina con error si no puede crear una copia válida; no elimina copias anteriores en ese caso. Conserva 30 archivos generados por el comando, no 30 días exactos. Nunca apuntes la retención al único archivo conservado fuera del servidor. Configura por separado una copia restringida y, si corresponde, cifrada hacia otro equipo: una carpeta en el mismo disco no protege frente a su pérdida.

El formato SQLite incluye todas las tablas. No copies únicamente `motoshop.sqlite` mientras está abierto: las escrituras recientes pueden estar en WAL. `backup.mjs` utiliza la API de respaldo online de SQLite y puede trabajar con la aplicación en funcionamiento.

### Docker Compose

La imagen incluye los comandos de copia y recuperación. Ejemplo desde el directorio `SCORTA`, con Compose preparado y Node 24 en el anfitrión:

```sh
mkdir -p backups
docker compose exec -T app node backup.mjs /data/backups --keep 30
```

Este ejemplo guarda las copias dentro del volumen; **debes extraerlas a otro lugar** para que sean útiles si se pierde el servidor o el volumen. `docker compose cp app:/data/backups/. ./backups/` permite copiarlas al anfitrión. Valida y vigila la copia externa antes de depender de ella. La retención dentro del volumen no elimina archivos ya extraídos; define una retención externa independiente.

## Ensayo de restauración

1. Descarga un respaldo completo o genera uno con el comando CLI.
2. Selecciona un directorio vacío y aislado de la base del negocio.
3. Ejecuta `DATA_DIR=/ruta/ensayo node restore.mjs /ruta/copia.sqlite --offline`.
4. Inicia una instancia local de prueba con `DATA_DIR=/ruta/ensayo HOST=127.0.0.1 PORT=3001 node server.mjs`.
5. Entra con una cuenta existente en el respaldo, confirma productos, cantidades e historial y registra una operación de prueba. No conectes este ensayo a los datos reales.
6. Detén la instancia de prueba. Conserva evidencia del resultado y de la fecha de la copia.

## Recuperación de una instalación

Detén el servicio y confirma que terminó antes de ejecutar la recuperación. El indicador `--offline` es una confirmación explícita; no es un detector universal de procesos. El programa rechaza archivos WAL/SHM para evitar sobrescribir una base activa. Si quedan tras un cierre inesperado, deja que SQLite recupere la base abriendo y cerrando correctamente el servicio, antes de volver a detenerlo. No los borres manualmente.

```sh
DATA_DIR=/srv/scorta/data node restore.mjs /ruta/copia.sqlite --offline
```

En Compose: detén `app`, inicia un contenedor de mantenimiento sin el servidor y con el volumen original, y ejecuta la restauración. Ejemplo usando una copia ya guardada en `/data/backups`:

```sh
docker compose stop app
docker compose run --rm --no-deps app node restore.mjs /data/backups/ARCHIVO.sqlite --offline
docker compose up -d app
```

Sustituye `ARCHIVO.sqlite` por un nombre real y revisa la salida de la recuperación antes de iniciar. El archivo anterior se conserva junto a la base con sufijo `.bak`; no se elimina automáticamente. La recuperación completa restaura también las contraseñas vigentes en la fecha del respaldo. Las sesiones de navegador no sobreviven al reinicio: vuelve a entrar.

Nunca uses `docker compose down -v` para mantenimiento: elimina los volúmenes. Tampoco restaures directamente sobre una base que siga atendiendo al almacén.

## Estado de conexión

La pantalla debe identificar la última actualización correcta, la consulta en curso, una desconexión y el guardado pendiente. Una desconexión no implica que la operación falló: puede haberse guardado antes de perder la respuesta. Conserva el formulario y reintenta la misma operación para reutilizar su identificador, sin crear una venta nueva. Tras restaurar datos históricos, revisa manualmente cualquier operación pendiente anterior a la recuperación.
