# Salida de Render (OPS-21)

Actualizado: 25 de noviembre de 2026. Plan para sacar SCORTA de Render y dejarlo funcionando en otro proveedor **en menos de un día**, con una ventana de corte de 1 a 2 horas. Sirve si Render sube precios, cambia condiciones, falla de forma prolongada o simplemente se decide cambiar.

Relacionados: [OPERACION.md](OPERACION.md) (respaldos, restauración, variables) · [SECRETOS.md](SECRETOS.md) · [seguridad.md](seguridad.md)

> Todavía no se ha ensayado. El primer ensayo (sección 7) es la condición para confiar en los tiempos de este documento.

## 1. Qué hay que mover

SCORTA es **un solo proceso de Node 24** con **un solo archivo de datos**. Eso hace la salida sencilla:

| Pieza | Dónde está hoy | Qué se hace |
|---|---|---|
| Código | GitHub (`SCORTA/`) | Nada: el destino construye desde el mismo repositorio con el `Dockerfile`. |
| Datos | `platform.sqlite` en el disco de Render (`DATA_DIR=/var/data`) | Respaldo final cifrado → R2 → descarga en el destino → descifrar → restaurar. |
| Respaldos externos | Bucket R2 (Cloudflare) | No cambian: el destino sigue subiendo al mismo bucket. |
| Variables y secretos | *Environment* del servicio en Render | Se copian una por una al destino (lista en la sección 4). |
| Dominio | DNS en Cloudflare, apuntando a Render | Se cambia el registro al destino (sección 5, paso 9). |

No hay que mover: sesiones (la restauración las borra y todos vuelven a ingresar), `motoshop.sqlite` del servidor heredado (la plataforma no lo usa), ni las copias `backups/startup-*.sqlite` (el destino crea las suyas).

## 2. Elegir el destino

Los tres sirven con el `Dockerfile` del repositorio (Node 24 Alpine, usuario `node`, datos en `/data`, puerto 3000, `HEALTHCHECK` a `/healthz`). Lo único obligatorio es **un disco persistente montado en `/data` y una sola instancia** (SQLite no admite dos procesos escribiendo).

| Opción | A favor | En contra | Cuándo elegirla |
|---|---|---|---|
| **Fly.io** | Usa el `Dockerfile` tal cual; volúmenes persistentes; certificados automáticos; CLI completa (`fly ssh console`, `fly secrets`). | Hay que escribir un `fly.toml` corto; el volumen vive en una sola región. | Opción por defecto si se quiere seguir en una plataforma administrada. |
| **Railway** | Panel parecido a Render; detecta el `Dockerfile`; volúmenes; variables desde el panel. | Menos control del volumen y de la consola que Fly; revisar el precio por uso. | Si se prefiere hacer todo desde el navegador. |
| **VPS propio** (Hetzner, DigitalOcean, Contabo, etc.) | El `compose.yaml` + `Caddyfile` del repositorio ya funcionan (ver anexo de [OPERACION.md](OPERACION.md#anexo-instalación-propia-docker-y-caddy)); costo fijo y bajo; control total. | Tú administras el sistema operativo, las actualizaciones, el firewall y la vigilancia. | Si hay alguien que pueda mantener un servidor Linux. |

## 3. Preparación (días antes, sin tocar producción)

Hazla completa antes del día del corte. Nada de esto afecta a los almacenes.

1. **Cuenta en el destino** con 2FA activa. Guarda el acceso en el gestor de contraseñas.
2. **Llave del respaldo a mano:** confirma que tienes `SCORTA_BACKUP_KEY` fuera de Render (gestor de contraseñas). Sin ella no se puede descifrar nada.
3. **Prueba de descifrado:** descarga del bucket el `.sqlite.enc` más reciente y descífralo en tu PC (`node platform-backup.mjs decrypt …`, ver [OPERACION.md](OPERACION.md#3-respaldos)). Si falla, **para aquí** y resuélvelo primero.
4. **Despliegue de prueba en el destino** con una copia de datos (el respaldo del punto 3) y un dominio temporal (`*.fly.dev`, `*.up.railway.app` o un subdominio como `nuevo.tudominio.com`). Sigue la sección 5 completa sobre ese entorno: así el día del corte solo se repite.
5. **Corre la prueba de humo** contra el entorno de prueba: `npm run smoke -- https://<dominio-temporal>`.
6. **Baja el TTL** del registro DNS del dominio en Cloudflare a 5 minutos (solo importa si el registro está en «DNS only», nube gris; con proxy naranja el cambio es inmediato).
7. **Elige la ventana** (por ejemplo, de 9 p. m. a 11 p. m., hora de Bogotá, cuando los almacenes están cerrados) y avisa con al menos 48 horas (plantilla en [OPERACION.md](OPERACION.md#76-avisar-a-los-almacenes)).
8. **Borra el entorno de prueba** o vacíale los datos después de ensayar: contiene datos reales de clientes.

## 4. Variables de entorno

Cópialas desde Render → servicio → *Environment*. Las marcadas como secreto van al gestor de secretos del destino (`fly secrets set`, variables «sealed» de Railway, o `.env` con permisos `600` en el VPS), nunca al repositorio.

| Variable | Valor en el destino |
|---|---|
| `NODE_ENV` | `production` (el `Dockerfile` ya la fija) |
| `HOST`, `PORT` | `0.0.0.0` y `3000` (ya fijas en el `Dockerfile`) |
| `DATA_DIR` | `/data` (ya fija en el `Dockerfile`; **cambia** respecto a Render, que usa `/var/data`) |
| `SCORTA_PUBLIC_URL` | La misma URL pública de hoy (p. ej. `https://app.tudominio.com`). Si cambia el dominio, cambian los enlaces y el control de origen (CSRF). |
| `SCORTA_OWNER_COMPANY`, `SCORTA_OWNER_USER`, `SCORTA_OWNER_NAME`, `SCORTA_OWNER_EMAIL`, `SCORTA_OWNER_CONTACT` | Iguales a Render. |
| `SCORTA_OWNER_PASSWORD` | **No la pongas.** Solo sirve para crear una plataforma vacía; aquí se restaura una existente. |
| `SCORTA_CLIENT_IP_HEADER` / `SCORTA_TRUSTED_PROXY_HOPS` | Con Cloudflare en modo proxy (nube naranja): `cf-connecting-ip`. Sin proxy de Cloudflare: Fly → `fly-client-ip`; VPS con Caddy → `x-forwarded-for` y `1`; Railway → `x-forwarded-for` (verifica con `SCORTA_LOG_IP_HEADERS=1` como explica `.env.example`). |
| `SCORTA_BACKUP_KEY` (secreto) | **La misma** que en Render, para poder descifrar el respaldo final y para que los nuevos respaldos usen la misma llave. |
| `SCORTA_S3_ENDPOINT`, `SCORTA_S3_BUCKET`, `SCORTA_S3_REGION`, `SCORTA_S3_PREFIX` | Iguales a Render. |
| `SCORTA_S3_ACCESS_KEY_ID`, `SCORTA_S3_SECRET_ACCESS_KEY` (secretos) | Iguales; o mejor, una llave nueva de solo escritura para el destino y revocar la de Render al final. |
| `SCORTA_BACKUP_PING_URL`, `SCORTA_HEALTH_TOKEN` (secreto) | Iguales. |
| `RESEND_API_KEY` (secreto), `SCORTA_MAIL_FROM`, `SCORTA_MAIL_WEBHOOK_URL`, `SCORTA_MAIL_WEBHOOK_SECRET` | Iguales (si se usan). |
| `SCORTA_TEST_COMPANY` | `0`. |
| `SCORTA_VERSION` | Opcional: el commit desplegado (fuera de Render no existe `RENDER_GIT_COMMIT`, así que `/healthz` mostraría `dev`). |
| Cualquier variable nueva que exista en Render el día del corte (por ejemplo, las del almacenamiento de fotos en R2 cuando se activen) | Cópiala también. Compara la lista completa de Render antes de empezar. |

**VPS con `compose.yaml`:** el archivo solo pasa al contenedor las variables del propietario y `SCORTA_PUBLIC_URL`. Para las demás crea junto a él un `compose.override.yaml` que no se sube al repositorio:

```yaml
services:
  app:
    env_file: .env
```

## 5. Día del corte, paso a paso

Tiempo esperado: 60–90 minutos. Anota la hora de cada paso.

| # | Paso | Dónde | Comprobación |
|---|---|---|---|
| 1 | **Avisa** a los almacenes que empieza el mantenimiento. | WhatsApp / correo | — |
| 2 | **Congela las escrituras:** Render → *Environment* → `SCORTA_MAINTENANCE=1` → *Save*. Render reinicia sin abrir la base: nadie puede escribir. | Render | La app muestra «SCORTA está en mantenimiento»; `/api/...` responde 503; en el log aparece `maintenance-mode`; `/healthz` responde con `"maintenance":true`. Pausa UptimeRobot. |
| 3 | **Respaldo final** (consistente, con la base cerrada): | Render Shell | Imprime la ruta del archivo `scorta-platform-…sqlite`. |
|   | `node platform-backup.mjs save $DATA_DIR/platform.sqlite $DATA_DIR/backups` | | |
| 4 | **Súbelo cifrado a R2** con el mismo código del respaldo horario (usa la llave y el bucket que ya están en Render): | Render Shell | Imprime la clave del objeto `…/salida-render/scorta-platform-….sqlite.enc`. Verifica en el panel de R2 que el archivo está y pesa más de 0 bytes. |
|   | ver bloque «Subir el respaldo final» debajo de la tabla | | |
| 5 | **Pon el destino en mantenimiento** antes de que abra una base: variable `SCORTA_MAINTENANCE=1` y despliega (Fly: `fly secrets set SCORTA_MAINTENANCE=1`; Railway: variable en el panel; VPS: en `.env` y `docker compose up -d --build`). | Destino | `/healthz` del dominio temporal responde con `"maintenance":true`. |
| 6 | **Copia el respaldo al destino:** en el panel de R2 genera una URL firmada de descarga del archivo del paso 4 que **venza en 15 minutos**, y descárgalo dentro del contenedor: | Consola del destino (`fly ssh console`, consola de Railway, o `docker compose exec app sh`) | `ls -l /data/final.sqlite.enc` muestra el archivo con el mismo tamaño que en R2. |
|   | `wget -O /data/final.sqlite.enc '<url-firmada>'` | | |
| 7 | **Descifra** (la llave ya está en el entorno del destino; no la escribas en el comando): | Consola del destino | Imprime `/data/final.sqlite` y no dice «No se pudo descifrar». |
|   | `cd /app && node platform-backup.mjs decrypt /data/final.sqlite.enc /data/final.sqlite` | | |
| 8 | **Restaura** en la ruta definitiva: | Consola del destino | Imprime un JSON con `target`. Si habla de archivos WAL/SHM o de la plataforma abierta, el destino **no** está en mantenimiento: vuelve al paso 5. |
|   | `node platform-backup.mjs restore /data/final.sqlite /data/platform.sqlite --offline` | | |
| 9 | **Quita el mantenimiento en el destino** (borra `SCORTA_MAINTENANCE` y redepliega/reinicia). | Destino | `/healthz` del dominio temporal responde `{"ok":true,…}`. |
| 10 | **Corte de DNS en Cloudflare:** en el registro del dominio cambia el destino de Render al nuevo (Fly: `CNAME` a `<app>.fly.dev` después de `fly certs add <dominio>`; Railway: el `CNAME` que muestra al añadir el dominio personalizado; VPS: registro `A`/`AAAA` a la IP del servidor). | Cloudflare | `nslookup <dominio>` (o el panel) muestra el nuevo destino. |
|   | Si el registro está en proxy (nube naranja), deja SSL/TLS en **Full (strict)**. En un VPS, pon el registro primero en «DNS only» para que Caddy obtenga el certificado y luego vuelve a activar el proxy. | | |
| 11 | **Verifica** (sección 6). | Tu PC y la app | Todo en verde. |
| 12 | **Avisa** a los almacenes que el servicio volvió. Todos deben ingresar de nuevo (la restauración cierra las sesiones). No se perdió nada: las escrituras estaban congeladas desde el paso 2. | WhatsApp / correo | — |
| 13 | **Limpia:** borra `/data/final.sqlite.enc` y `/data/final.sqlite` del destino. Deja Render **detenido pero sin borrar** (con `SCORTA_MAINTENANCE=1`) durante 7 días. | Destino y Render | — |

**Subir el respaldo final (paso 4).** Desde la carpeta del código en Render Shell (`cd /opt/render/project/src/SCORTA`), cambiando `ARCHIVO` por la ruta que imprimió el paso 3:

```sh
ARCHIVO=$DATA_DIR/backups/scorta-platform-XXXX.sqlite
node --input-type=module -e "
import {readFileSync} from 'node:fs';
import {encryptBackup,putObject,offsiteConfig} from './ops/offsite-backup.mjs';
const {config,missing}=offsiteConfig();if(missing.length)throw Error('Faltan variables: '+missing.join(', '));
const file=process.argv[1],key=(config.prefix?config.prefix.replace(/\/+$/,'')+'/':'')+'salida-render/'+file.split('/').pop()+'.enc';
await putObject(config,key,encryptBackup(readFileSync(file),config.key));console.log(key);
" "$ARCHIVO"
```

Si R2 no está disponible, alternativa: descarga el `.sqlite` desde Render Shell por otro medio seguro que controles y súbelo al destino; nunca lo dejes sin cifrar en un servicio de terceros.

## 6. Verificación

1. **Prueba de humo** desde tu PC (no crea datos ni inicia sesión):
   ```sh
   cd SCORTA
   npm run smoke -- https://<dominio>
   ```
   Debe terminar sin ninguna línea `FALLA` (código de salida 0). Revisa cabeceras de seguridad, `/healthz`, HTTPS y la página principal.
2. `https://<dominio>/healthz` con `Authorization: Bearer <SCORTA_HEALTH_TOKEN>` muestra la base abierta y el disco con espacio.
3. Ingresas como propietario (con tu código 2FA) y ves todas las empresas.
4. En una empresa, la última venta es la última registrada antes del paso 2.
5. Haces una venta de prueba en tu empresa propia y la anulas.
6. Un comprobante público antiguo sigue abriendo (los enlaces viven en la base).
7. A los 2–60 minutos el log del destino muestra `offsite-backup` y Healthchecks.io recibe el aviso. Si no, revisa las variables `SCORTA_S3_*`.
8. Reactiva UptimeRobot apuntando al mismo dominio.

## 7. Rollback

El rollback es posible mientras Render siga existiendo con su disco (por eso no se borra durante 7 días).

**Antes de abrir el destino a los almacenes (pasos 5–11 fallan):** no se escribió nada nuevo. En Render borra `SCORTA_MAINTENANCE` → *Save*; si cambiaste el DNS, devuélvelo al valor de Render. Render abre la misma base que tenía. Tiempo: 10 minutos.

**Después de que los almacenes trabajaron en el destino:** las ventas nuevas solo existen en el destino. Repite la sección 5 en sentido contrario: mantenimiento en el destino → `save` → subir cifrado a R2 → en Render con `SCORTA_MAINTENANCE=1` descargar, descifrar y `restore --offline` (pasos 5–8 de [OPERACION.md](OPERACION.md#5-restauración-paso-a-paso-en-render)) → quitar mantenimiento → DNS de vuelta a Render.

Decide el rollback rápido: si a los 30 minutos del paso 9 la verificación no pasa, vuelve a Render y reintenta otro día.

## 8. Después del corte

- Revoca en R2 la llave de escritura que usaba Render (si creaste una nueva para el destino) y actualiza [SECRETOS.md](SECRETOS.md).
- Pasados 7 días sin incidentes: borra el servicio y el disco de Render.
- Ajusta [OPERACION.md](OPERACION.md) y el `render.yaml` al nuevo proveedor (el procedimiento de restauración cambia de «Render Shell» a la consola del destino).
- Registra el corte: hora de inicio, hora de fin, duración real de cada paso y problemas encontrados.

## Anexo: `fly.toml` mínimo

Ejemplo para la carpeta `SCORTA/` (no se incluye en el repositorio hasta que se elija Fly):

```toml
app = "scorta"
primary_region = "mia"   # elige la región más cercana a Colombia de `fly platform regions`

[build]
  dockerfile = "Dockerfile"

[mounts]
  source = "scorta_data"
  destination = "/data"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    method = "GET"
    path = "/healthz"
    interval = "30s"
    timeout = "5s"
    grace_period = "20s"
```

Comandos: `fly launch --no-deploy` (usa este archivo), `fly volumes create scorta_data --size 1 --region mia`, `fly secrets set …` por cada variable secreta, `fly deploy`, `fly scale count 1` (una sola máquina: SQLite no admite dos).
