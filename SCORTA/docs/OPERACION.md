# Operación y recuperación de SCORTA

Estos procedimientos están preparados para revisión; no se ha configurado ni desplegado un servidor externo.

## Elegir la instalación antes de usar datos reales

| Acceso necesario | Preparación de infraestructura pendiente |
| --- | --- |
| Un computador del almacén | Elegir ese equipo como servidor, mantener datos persistentes y arranque del servicio; preparar una URL HTTPS y certificado confiable para el navegador. El modo local de desarrollo no es la instalación real. |
| Varios equipos dentro del almacén | Elegir servidor y dirección estable de la red, resolver el nombre desde los equipos y preparar HTTPS confiable en cada cliente. Definir qué ocurre si el servidor o la red se apagan. |
| Equipos dentro y fuera del almacén | Elegir servidor o alojamiento, dominio y DNS; preparar HTTPS y acceso desde las redes que realmente se utilizarán. |

La autenticación de producción utiliza cookies Secure y espera el origen HTTPS. Ejecutar simplemente `npm start` por HTTP en desarrollo no cierra este pendiente, aunque la pantalla abra. La configuración Compose actual está preparada para un dominio que Caddy pueda atender por HTTPS; una instalación privada necesita acordar resolución y confianza de certificados antes de reutilizarla.

No se han elegido todavía el servidor, el dominio ni el destino externo de respaldo. No se han creado cuentas del personal ni importado existencias reales.

## Preparación de Docker Compose en el servidor elegido

Desde la carpeta `SCORTA`, con Docker y Compose instalados:

1. Copiar `.env.example` a `.env` y completar el dominio y una contraseña inicial propia. Introducirla directamente en ese equipo, no en el chat ni en el repositorio. Restringir `.env` a la cuenta que opera el servicio.
2. Ejecutar `docker compose config --quiet`. Este comando valida la configuración sin mostrar las variables resueltas. Evitar compartir la salida de `docker compose config` sin `--quiet`, porque puede contener la contraseña.
3. Verificar DNS y puertos 80/443 de la instalación seleccionada antes de iniciar Caddy. La aplicación no publica el puerto 3000 al anfitrión: el acceso de los usuarios pasa por el proxy HTTPS.
4. Construir e iniciar con `docker compose up -d --build`; revisar `docker compose ps` y los registros del proxy y de la aplicación. Estos comandos se ejecutarán cuando exista un servidor de destino; no se ejecutaron como despliegue desde esta preparación.
5. Comprobar escritura del volumen con el usuario real del contenedor, entrar desde la URL HTTPS y crear una cuenta de operador de prueba. El primer administrador se crea con la configuración inicial; cambiar después la variable no cambia su contraseña.

Comprobación del directorio persistente, sin modificar el inventario:

```sh
docker compose exec -T app node --input-type=module -e "import {accessSync,constants} from 'node:fs'; accessSync('/data',constants.R_OK|constants.W_OK); console.log('Directorio persistente accesible')"
```

La imagen ejecuta la aplicación como `node` y prepara `/data` para ese usuario; el volumen nombrado `inventory` conserva los datos al recrear el contenedor. Si se sustituye por una carpeta del anfitrión, sus permisos deben comprobarse de nuevo. No resolver un error de permisos ejecutando la aplicación como administrador o dando permisos globales al directorio.

## Respaldos programados

Con Node 24, prepara un directorio de respaldos accesible solo al usuario del servicio. Ejecuta primero el comando manualmente. Para un servidor cuyo cron utiliza UTC, el siguiente ejemplo corresponde a las **02:00 de Bogotá** (07:00 UTC). Si cron ya utiliza America/Bogota, cambia la hora de 7 a 2; confirma primero la zona horaria del servidor y ajusta las rutas y la ruta de Node.

```cron
0 7 * * * DATA_DIR=/srv/scorta/data /usr/bin/node /srv/scorta/backup.mjs /srv/scorta/backups --keep 30 >> /srv/scorta/backup.log 2>&1
```

Revisa el resultado y la fecha de la copia más reciente cada día. El comando termina con error si no puede crear una copia válida; no elimina copias anteriores en ese caso. Conserva 30 archivos generados por el comando, no 30 días exactos. Nunca apuntes la retención al único archivo conservado fuera del servidor. Configura por separado una copia restringida y, si corresponde, cifrada hacia otro equipo: una carpeta en el mismo disco no protege frente a su pérdida.

El formato SQLite incluye todas las tablas. No copies únicamente `motoshop.sqlite` mientras está abierto: las escrituras recientes pueden estar en WAL. `backup.mjs` utiliza la API de respaldo online de SQLite y puede trabajar con la aplicación en funcionamiento.

### Docker Compose

La imagen incluye los comandos de copia y recuperación. Ejemplo desde el directorio `SCORTA`, con Compose preparado y Node 24 en el anfitrión:

```sh
umask 077
mkdir -p backups
docker compose exec -T app node backup.mjs /data/backups --keep 30
```

Este ejemplo guarda las copias dentro del volumen; **debes extraerlas a otro lugar** para que sean útiles si se pierde el servidor o el volumen. `docker compose cp app:/data/backups/. ./backups/` permite copiarlas al anfitrión. Valida y vigila la copia externa antes de depender de ella. La retención dentro del volumen no elimina archivos ya extraídos; define una retención externa independiente.

### Copia fuera del servidor y comprobación diaria

La tarea no se considera terminada al generar una copia dentro de `inventory`. Infraestructura debe elegir un destino independiente, configurar el acceso y comprobar que el archivo llega. Para una copia concreta de Compose, sustituir `ARCHIVO.sqlite` por el nombre mostrado al crear el respaldo:

```sh
umask 077
mkdir -p backups
docker compose cp app:/data/backups/ARCHIVO.sqlite ./backups/ARCHIVO.sqlite
chmod 600 ./backups/ARCHIVO.sqlite
```

Después se copia ese archivo al destino externo acordado. Si se elige otro servidor mediante SSH, una plantilla es `scp -p -- ./backups/ARCHIVO.sqlite usuario@servidor-de-respaldo:/ruta/restringida/`; deben configurarse antes el destino, su clave de host y el acceso de la cuenta operadora. No hay un destino real configurado ni una transferencia externa verificada en esta entrega. Para un disco externo, comprobar también que sea otro dispositivo y que esté montado antes de copiar; una carpeta en el mismo disco no es un respaldo externo.

La programación definitiva debe ejecutar creación y copia en secuencia, devolver error si cualquiera falla y avisar a una persona responsable. Antes de cerrar el pendiente se comprueban una ejecución automática, la fecha de la última copia en el destino independiente y una restauración desde esa copia. La política de retención del destino externo se configura separadamente: el parámetro `--keep` del comando solo controla su directorio de salida.

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

## Preparación verificada y cierres pendientes

El 12 de noviembre de 2026 se comprobó que el daemon Docker local del entorno de desarrollo responde y que `docker compose config --quiet` acepta `compose.yaml` con valores ficticios de validación. No se iniciaron contenedores, no se construyó la imagen ni se emitió un certificado real. Los valores utilizados no corresponden a un dominio ni a una cuenta del almacén.

Las pruebas existentes de `tests/backup.test.mjs` ya cubren copia con WAL abierto, restauración aislada, cuentas y claves de reintento. No se repitieron pruebas de negocio por esta ampliación documental. Esa evidencia no comprueba los permisos de un servidor de destino que todavía no existe.

Para cerrar la preparación de infraestructura faltan: elegir dónde y cómo se accederá; disponer del servidor y resolver su nombre; completar HTTPS y la construcción real de la imagen; comprobar volumen y arranque; programar creación y copia independiente de respaldos; y ensayar recuperación y acceso desde los equipos del almacén. El responsable técnico debe registrar fecha y resultado de esas verificaciones en la instalación definitiva.
