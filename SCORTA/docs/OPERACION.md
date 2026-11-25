# Operación de SCORTA en Render

Actualizado: 21 de noviembre de 2026. Reemplaza la guía anterior basada en Docker Compose, que ahora está en el [Anexo: instalación propia](#anexo-instalación-propia-docker-y-caddy).

> **Fase actual.** SCORTA corre en el **plan gratuito de Render, que no tiene disco persistente**. Los datos se borran en cada deploy, reinicio o cuando la instancia se duerme. Úsalo solo con datos ficticios. Antes de cargar datos reales hay que contratar el plan pago con disco (US-05), elegir la región (US-06) y cumplir la lista de [Antes del primer cliente](#antes-del-primer-cliente).

Documentos relacionados: [seguridad.md](seguridad.md) · [INCIDENTES-SEGURIDAD.md](INCIDENTES-SEGURIDAD.md) · [SECRETOS.md](SECRETOS.md) · [PLATFORM-API.md](PLATFORM-API.md)

---

## 1. Arquitectura

```
Navegador (almacén, celular o PC)
   │ HTTPS
   ▼
Cloudflare (DNS, proxy y TLS del dominio propio)        ← opcional hasta tener dominio (US-14)
   │
   ▼
Render · Web Service (Node 24, 1 sola instancia, región EE. UU.)
   └─ server.mjs
        ├─ /api/v2/*  → platform-server.mjs → platform.mjs → DATA_DIR/platform.sqlite
        ├─ /healthz   → estado del servicio (lo usan Render y UptimeRobot)
        └─ archivos de la app (dist/)
   └─ Disco persistente de Render montado en DATA_DIR (p. ej. /var/data)
        ├─ platform.sqlite          ← TODAS las empresas, usuarios, ventas y auditoría
        └─ backups/startup-*.sqlite ← copia local al arrancar (últimas 5)
   │
   ├─ cada hora → respaldo cifrado → almacenamiento S3 compatible (Cloudflare R2)
   │                                  └─ aviso a Healthchecks.io (éxito o fallo)
   └─ logs (una línea JSON por petición) → panel de Render
```

Puntos clave:

- **Una sola base**: `platform.sqlite` guarda todo. Si se daña o se pierde, se pierden todas las empresas hasta restaurar.
- **Una sola instancia**: con disco, Render no permite varias instancias ni deploys sin corte. Cada deploy corta el servicio entre unos segundos y un par de minutos.
- **`motoshop.sqlite`** es la base heredada. El servidor todavía la abre, pero la plataforma no la usa. Los comandos `backup.mjs` y `restore.mjs` solo sirven para esa base: **no respaldan la plataforma**.
- **GitHub** guarda el código y corre las pruebas (CI). No guarda datos de clientes.

---

## 2. Variables de entorno

Se configuran en Render → servicio → *Environment*. Las marcadas como **secreto** nunca van en el repositorio, en chats ni en capturas. El inventario completo de secretos está en [SECRETOS.md](SECRETOS.md).

### Servidor

| Variable | Valor en producción | Para qué sirve |
|---|---|---|
| `NODE_ENV` | `production` | Activa cookie `Secure`, HSTS y el control estricto de origen. |
| `HOST` | `0.0.0.0` | Render necesita que el servicio escuche en todas las interfaces. |
| `PORT` | (lo pone Render) | Puerto interno. No lo cambies. |
| `NODE_VERSION` | `24` | Opcional: `package.json` ya fija Node 24 (`engines`). |
| `DATA_DIR` | `/var/data` (la ruta donde montaste el disco) | Carpeta de `platform.sqlite` y de los respaldos locales. **Sin disco, todo se borra.** |
| `SCORTA_PUBLIC_URL` | `https://<tu-dominio>` o `https://<servicio>.onrender.com` | Origen público exacto. Si no coincide con la URL que usa el navegador, **el servidor rechaza todos los cambios (POST)**. |
| `SCORTA_MAINTENANCE` | vacío (normal) · `1` (mantenimiento) | Con `1` el servicio arranca **sin abrir la base**, para poder restaurar desde Render Shell. Los usuarios no pueden trabajar mientras esté activo. |
| `SCORTA_REQUIRE_TERMS` | `1` cuando los textos legales estén aprobados | Exige que el representante del almacén acepte los términos antes del primer uso (BE-07). Déjalo vacío mientras los textos sean borradores. |

### Propietario de la plataforma

| Variable | Valor | Notas |
|---|---|---|
| `SCORTA_OWNER_COMPANY` | nombre de la empresa propietaria | Cambia el valor por defecto (`Fragola`) (US-10). |
| `SCORTA_OWNER_USER` | usuario del propietario | Cambia el valor por defecto (`Steven`) (US-10). |
| `SCORTA_OWNER_NAME` | nombre visible | |
| `SCORTA_OWNER_PASSWORD` | **secreto** | Solo crea al propietario cuando la base es nueva. **Bórrala de Render después del primer arranque** (ver [SECRETOS.md](SECRETOS.md)). Cambiarla después no cambia la contraseña. |
| `SCORTA_OWNER_EMAIL`, `SCORTA_OWNER_CONTACT` | opcionales | El contacto se muestra a los almacenes en «Mi suscripción». |

### IP real del cliente (límite de intentos)

| Variable | Valor | Para qué sirve |
|---|---|---|
| `SCORTA_CLIENT_IP_HEADER` | `cf-connecting-ip` si usas Cloudflare delante; `x-forwarded-for` si solo usas Render | Cabecera de la que se toma la IP real. Vacía = IP del socket (la del proxy), lo que convierte el límite de intentos en un bloqueo global. |
| `SCORTA_TRUSTED_PROXY_HOPS` | `1` (por defecto) | Con `x-forwarded-for`, cuántos proxies de confianza hay; la IP se toma contando desde la derecha. La de la izquierda la puede falsificar cualquiera. |
| `SCORTA_LOG_IP_HEADERS` | `1` solo para diagnosticar | Escribe en el log las cabeceras de IP (nunca cookies) para comprobar la configuración. Quítalo cuando termines. |

> **Cuidado con `cf-connecting-ip`:** solo es confiable si **todo** el tráfico pasa por Cloudflare. Si alguien entra directo a `<servicio>.onrender.com`, puede inventar esa cabecera. Mientras no puedas bloquear el acceso directo, usa `x-forwarded-for` con `SCORTA_TRUSTED_PROXY_HOPS` ajustado (con Cloudflare delante de Render suelen ser 2 saltos; compruébalo con `SCORTA_LOG_IP_HEADERS=1`).
>
> Comprueba la IP real una vez en Render (QA-07): activa `SCORTA_LOG_IP_HEADERS=1`, entra desde tu celular con datos móviles, revisa el log y confirma que la IP coincide con la de tu celular. Luego quita la variable.

### Respaldo externo

| Variable | Valor | Notas |
|---|---|---|
| `SCORTA_BACKUP_KEY` | **secreto** | Llave de cifrado. Recomendado: 32 bytes en base64 (`node -e "console.log(crypto.randomBytes(32).toString('base64'))"`). **Guarda una copia fuera de Render** (gestor de contraseñas). Sin ella, los respaldos no se pueden abrir. |
| `SCORTA_S3_ENDPOINT` | `https://<cuenta>.r2.cloudflarestorage.com` | Dirección S3 del almacenamiento (R2, B2 o S3). |
| `SCORTA_S3_BUCKET` | p. ej. `scorta-respaldos` | Bucket con versionado o bloqueo activado. |
| `SCORTA_S3_REGION` | `auto` (R2) | Región S3. |
| `SCORTA_S3_ACCESS_KEY_ID` | **secreto** | Llave de acceso **solo de escritura** a ese bucket. |
| `SCORTA_S3_SECRET_ACCESS_KEY` | **secreto** | |
| `SCORTA_S3_PREFIX` | p. ej. `produccion` | Carpeta dentro del bucket. Usa otro prefijo para staging. |
| `SCORTA_BACKUP_INTERVAL_MIN` | `60` | Minutos entre respaldos. |
| `SCORTA_BACKUP_PING_URL` | URL de Healthchecks.io | Se llama después de cada respaldo (y `/fail` si falla). |

Si falta cualquiera de `SCORTA_S3_ENDPOINT`, `SCORTA_S3_BUCKET`, `SCORTA_S3_ACCESS_KEY_ID`, `SCORTA_S3_SECRET_ACCESS_KEY` o `SCORTA_BACKUP_KEY`, el respaldo externo **queda apagado** y el log muestra `offsite-backup-disabled` con la lista de las que faltan.

### Correo de recuperación (SEG-13)

| Variable | Valor | Notas |
|---|---|---|
| `RESEND_API_KEY` | **secreto** | Llave de [Resend](https://resend.com) con permiso solo de envío. Activa la recuperación de contraseña por correo y la verificación del correo en «Mi perfil». |
| `SCORTA_MAIL_FROM` | `SCORTA <no-responder@tudominio.com>` | Remitente de un dominio **verificado** en Resend (registros SPF/DKIM). Obligatorio con Resend. |
| `SCORTA_MAIL_WEBHOOK_URL` | `https://…` | Alternativa genérica a Resend: recibe `POST` JSON `{from,to,subject,text}`. Solo HTTPS. |
| `SCORTA_MAIL_WEBHOOK_SECRET` | **secreto** | Opcional; llega como `Authorization: Bearer …`. |

- Sin estas variables el correo queda **apagado**: el ingreso dice «La recuperación por correo no está configurada; pide a tu administrador que restablezca tu contraseña» y no se envía nada. El administrador sigue usando «Restablecer contraseña» (contraseña temporal).
- Los enlaces usan **solo** `SCORTA_PUBLIC_URL` (`<SCORTA_PUBLIC_URL>/recuperar#<token>`); sin ella tampoco se envían correos.
- Flujo: el usuario registra y verifica su correo en «Mi perfil» (código de 6 dígitos, 10 minutos). Desde «¿Olvidaste tu contraseña?» recibe un enlace de un solo uso que vence en 1 hora; al cambiarla se cierran todas sus sesiones y se le avisa por correo.
- Límites: 10 solicitudes por IP y 3 enlaces por cuenta cada 15 minutos; la respuesta es siempre la misma, exista o no la cuenta.
- El log muestra `mail-config` al arrancar (`enabled:true|false`), `mail-sent` y `mail-failed` con el destinatario enmascarado (`l***@dominio.com`). Si aparece `mail-failed`, revisa la llave, el dominio verificado y el panel de Resend.
- Prueba tras configurar: entra, verifica tu correo en «Mi perfil», cierra sesión y usa «¿Olvidaste tu contraseña?».

### Solo para el servidor heredado

`SCORTA_ADMIN_USER` y `SCORTA_ADMIN_PASSWORD` crean el primer usuario de `motoshop.sqlite`. No hacen falta en la plataforma multiempresa.

### Ajustes del servicio en Render

- **Health Check Path:** `/healthz`.
- **Disco:** montado en la ruta de `DATA_DIR`. Tamaño inicial sugerido: el mínimo del plan; vigila el uso en `/healthz` (aviso al 80 %).
- **Región:** la que elijas en US-06. No se puede cambiar después sin mudar el disco.
- **Auto-Deploy:** solo desde `main` y con CI en verde (OPS-05).

---

## 3. Respaldos

| Tipo | Cuándo | Dónde | Retención | Protege contra |
|---|---|---|---|---|
| **Externo cifrado** | Cada hora (`SCORTA_BACKUP_INTERVAL_MIN`); el primero 2 minutos después de arrancar | Bucket R2: `<prefijo>/AAAA/MM/DD/scorta-<fecha-hora>.sqlite.enc` | 30 días (regla de ciclo de vida del bucket, OPS-01) | Pérdida del disco, de la cuenta de Render, borrado o daño |
| **Local al arrancar** | En cada arranque y deploy, antes de abrir la base | `DATA_DIR/backups/startup-*.sqlite` | Las últimas 5 | Un deploy que daña datos; es lo más rápido para volver atrás |
| **Snapshot de Render** | Diario (lo hace Render) | Dentro de Render | La que fije Render | Errores del disco. No es una copia externa (OPS-11) |

Cómo funciona el respaldo externo: toma una copia consistente de `platform.sqlite`, la comprime, la cifra con AES-256-GCM usando `SCORTA_BACKUP_KEY` y la sube al bucket. Después avisa a Healthchecks.io. Si algo falla, escribe `offsite-backup-failed` en el log y avisa del fallo.

**Respaldo manual** (desde Render Shell):

```sh
node platform-backup.mjs save $DATA_DIR/platform.sqlite $DATA_DIR/backups
```

**Descifrar un respaldo descargado del bucket** (en Render Shell o en tu PC con Node 24):

```sh
SCORTA_BACKUP_KEY='<llave>' node platform-backup.mjs decrypt scorta-AAAA-MM-DD....sqlite.enc restaurar.sqlite
```

El comando se niega a sobrescribir un archivo existente y comprueba que el resultado sea una base válida de SCORTA. Si la llave es incorrecta o el archivo fue alterado, muestra «No se pudo descifrar».

> No escribas la llave en comandos que queden en historiales compartidos. En Render Shell ya existe como variable: usa `node platform-backup.mjs decrypt archivo.enc restaurar.sqlite` sin escribirla.

---

## 4. Objetivos de recuperación

> **Pendiente de aprobación del dueño (US-11).**

| Objetivo | Valor propuesto | Qué significa |
|---|---|---|
| **RPO** (datos que se pueden perder) | **≤ 1 hora** | En el peor caso se pierden las ventas de la última hora, porque el respaldo externo es horario. |
| **RTO** (tiempo para volver a funcionar) | **≤ 4 horas** | Desde que se detecta la caída hasta que los almacenes vuelven a vender. |

Condiciones para cumplirlos: respaldo horario funcionando y vigilado (Healthchecks), llave de cifrado guardada fuera de Render, este procedimiento probado en el ensayo trimestral y el dueño localizable por celular.

---

## 5. Restauración paso a paso en Render

Úsala cuando la base esté dañada, se haya borrado información o haya que volver a un punto anterior. Tiempo esperado: 30–60 minutos.

1. **Avisa a los almacenes** que el sistema estará en mantenimiento (plantilla en la sección 7.6).
2. **Elige el respaldo.**
   - Si el problema empezó con el último deploy: usa el más reciente de `DATA_DIR/backups/startup-*.sqlite` (ya está descifrado y en el disco).
   - Si no: en el panel de R2, entra al bucket, al prefijo y a la fecha, y elige el último archivo `.sqlite.enc` **anterior** al problema. Anota su nombre y hora.
3. **Activa el mantenimiento.** Render → *Environment* → `SCORTA_MAINTENANCE=1` → *Save*. Render reinicia el servicio sin abrir la base.
4. **Comprueba el mantenimiento.** Abre la app: debe mostrar «SCORTA está en mantenimiento». En el log aparece `maintenance-mode`. En este modo `/healthz` responde **503 a propósito**: UptimeRobot avisará (es esperado; pausa el monitor) y Render puede marcar el deploy como fallido. Si Render no deja el servicio arriba, borra temporalmente el *Health Check Path* y vuelve a ponerlo al terminar (paso 9).
5. **Entra por Render Shell** (servicio → *Shell*).
6. **Lleva el respaldo al disco** (si viene de R2). Descárgalo desde el panel de R2 a tu PC y súbelo al servidor, o usa una URL temporal firmada de R2 con `curl -o "$DATA_DIR/restaurar.sqlite.enc" '<url-firmada>'`. La URL firmada debe vencer en minutos.
7. **Descifra:**
   ```sh
   cd /opt/render/project/src/SCORTA   # o la carpeta donde está el código
   node platform-backup.mjs decrypt $DATA_DIR/restaurar.sqlite.enc $DATA_DIR/restaurar.sqlite
   ```
   Si usas una copia `startup-*.sqlite`, sáltate este paso: ya está descifrada.
8. **Restaura:**
   ```sh
   node platform-backup.mjs restore $DATA_DIR/restaurar.sqlite $DATA_DIR/platform.sqlite --offline
   ```
   El comando valida el respaldo, guarda la base anterior como `platform.sqlite.previous-<número>`, borra las sesiones y las ventas pendientes del respaldo y elimina archivos `-wal`/`-shm` vacíos. Si dice que hay archivos WAL/SHM con datos o que la plataforma está abierta, **detente**: el servicio no está en mantenimiento.
9. **Quita el mantenimiento.** Borra `SCORTA_MAINTENANCE` (o déjala vacía) → *Save*. Render reinicia y abre la base restaurada. Si quitaste el *Health Check Path*, vuelve a poner `/healthz` y reactiva el monitor de UptimeRobot.
10. **Verifica:**
    - `https://<dominio>/healthz` responde 200.
    - Entras como propietario y ves todas las empresas.
    - En una empresa de prueba, la última venta coincide con la hora del respaldo.
    - Haz una venta de prueba en tu empresa propia y anúlala.
    - Healthchecks.io recibe el siguiente respaldo (o haz uno manual).
11. **Avisa a los almacenes** que el servicio volvió y **desde qué hora** deben revisar o volver a registrar ventas (todo lo posterior al respaldo se perdió). Todos deben volver a entrar.
12. **Limpia:** borra `restaurar.sqlite` y `restaurar.sqlite.enc` del disco. Conserva `platform.sqlite.previous-*` 7 días por si hay que revisar algo y luego bórralo.
13. **Registra** el incidente: hora de inicio, respaldo usado, hora de fin y RTO real.

> La restauración devuelve las contraseñas que existían en la fecha del respaldo. Si alguien cambió su contraseña después, tendrá que usar la anterior o pedir un restablecimiento.

---

## 6. Monitoreo

| Qué | Herramienta | Configuración | Aviso a |
|---|---|---|---|
| ¿El servicio responde? | **UptimeRobot** (gratis) | Monitor HTTP(s) a `https://<dominio>/healthz` cada 5 min. Alerta si no responde 200 dos veces seguidas. | Celular del dueño (app y correo) (US-44) |
| ¿Se hizo el respaldo? | **Healthchecks.io** (gratis) | Un *check* con período de 1 h y gracia de 30 min. Su URL va en `SCORTA_BACKUP_PING_URL`. Alerta si no llega el aviso o si llega `/fail`. | Celular del dueño |
| Errores del servidor | Logs de Render | Busca `"level":"error"`, `offsite-backup-failed`, `offsite-backup-disabled`. Render guarda pocos días: envíalos a un servicio externo cuando se pueda (OPS-07). | Revisión semanal |
| Gasto | Render y Cloudflare | Alerta de facturación (US-45). | Correo del dueño |

`/healthz` responde 200 si la base abre bien y 503 si no (también 503 en modo mantenimiento, con `"maintenance":true`). Sin credenciales solo devuelve `ok`, `version`, `startedAt` y `warning`. El detalle completo exige la cabecera `Authorization: Bearer <SCORTA_HEALTH_TOKEN>` (define esa variable en Render con 16 caracteres o más; sin ella el detalle queda desactivado):

```powershell
curl.exe -H "Authorization: Bearer TU_TOKEN" https://<dominio>/healthz
```

El detalle incluye:

| Campo | Qué es |
|---|---|
| `version`, `startedAt` | Versión desplegada y hora de arranque |
| `db` | Tamaño de la base y del estado JSON |
| `disk.usedPct` | Porcentaje de disco usado |
| `latencyP95Ms` | Tiempo de respuesta p95 de la API |
| `lastBackup` | Último respaldo (local o externo), hora y si salió bien |
| `warning` | `true` si el disco supera 80 % o el estado supera 20 MB |

Consúltalo con el token una vez por semana y revisa `warning` y `lastBackup`.

Eventos útiles en el log de Render: `capacity-warning` (disco > 80 % o estado > 20 MB), `startup-backup` (copia local al arrancar), `offsite-backup-enabled`, `offsite-backup`, `offsite-backup-failed`, `offsite-backup-disabled`, `maintenance-mode`. Las líneas de peticiones guardan método, ruta, estado y duración; **no guardan la IP** salvo que actives `SCORTA_LOG_IP_HEADERS=1`.

**Página de estado (opcional):** UptimeRobot permite publicar una página de estado gratuita con el monitor de `/healthz`. Comparte ese enlace con los almacenes.

---

## 7. Runbook de incidentes

Para incidentes de **seguridad** (acceso indebido, filtración, llave expuesta) usa [INCIDENTES-SEGURIDAD.md](INCIDENTES-SEGURIDAD.md).

Pasos comunes a todo incidente:
1. Anota la hora en que empezó y cómo te enteraste.
2. Si el corte va a durar más de 15 minutos, avisa a los almacenes (7.6).
3. Al terminar, escribe en el registro: causa, qué hiciste, cuánto duró y qué hay que cambiar.

### 7.1 El servicio no responde (caída)

**Señales:** alerta de UptimeRobot; los almacenes no pueden entrar; `/healthz` falla.

1. Abre `https://status.render.com`. Si Render tiene un incidente en tu región, solo queda esperar y avisar a los almacenes.
2. En Render → servicio → *Events*: ¿hubo un deploy reciente? ¿falló?
   - **Deploy fallido:** Render mantiene la versión anterior. Revisa el log del build y corrige.
   - **Deploy exitoso pero la app falla:** haz *rollback* (sección 8.2).
3. En *Logs*, busca el último error (`"level":"error"`).
   - «La plataforma ya está abierta»: quedó un archivo `platform.sqlite.pid` de una instancia anterior. La versión actual ya lo ignora si está huérfano; si vuelve a pasar, reporta a BE.
   - Falta de memoria (*out of memory*): sube temporalmente el plan de la instancia y reporta a BE.
   - Error al abrir la base: ve a 7.3.
4. Si el servicio está en un bucle de reinicios sin causa clara: *Manual Deploy → Restart*. Si no mejora, pon `SCORTA_MAINTENANCE=1` para estabilizar y diagnostica desde Render Shell.
5. Confirma con `/healthz` y una venta de prueba.

### 7.2 Disco lleno

**Señales:** errores al guardar («disk full», `SQLITE_FULL`); `capacity-warning` en el log; `warning: true` o `disk.usedPct` alto en `/healthz`.

1. Render Shell: `df -h $DATA_DIR` y `du -sh $DATA_DIR/*`.
2. Libera espacio sin tocar `platform.sqlite`:
   - Borra copias viejas en `$DATA_DIR/backups/` (deja la más reciente).
   - Borra `platform.sqlite.previous-*` y `restaurar.sqlite*` que hayan quedado de restauraciones.
3. Si no alcanza: aumenta el tamaño del disco en Render (*Disks → Size*). Se puede aumentar, no reducir.
4. Revisa qué creció: si es la base, probablemente son fotos o logos (BE-06, BE-30). Reporta a BE.
5. Verifica con una venta de prueba y que el siguiente respaldo llegue a Healthchecks.

### 7.3 Base dañada

**Señales:** `/healthz` da 503; el log dice que la base no es válida, «database disk image is malformed» o similar; datos que desaparecen o se ven raros.

1. **No borres nada.** No ejecutes comandos que escriban en `platform.sqlite`.
2. Activa el mantenimiento (`SCORTA_MAINTENANCE=1`).
3. En Render Shell, copia la base dañada para analizarla después: `cp $DATA_DIR/platform.sqlite $DATA_DIR/danada-$(date +%Y%m%d%H%M).sqlite`.
4. Restaura el último respaldo bueno con la sección 5.
5. Si sospechas un error de la aplicación (no del disco), no despliegues nada nuevo hasta que BE revise la base dañada.

### 7.4 Datos borrados o equivocados por un usuario

1. Primero intenta corregir dentro de la app (anulación, ajuste, devolución): queda auditado y no afecta a otras empresas.
2. Restaurar devuelve **todas** las empresas al pasado. Hazlo solo si el daño es grave y el almacén lo pide por escrito, avisando a los demás almacenes.
3. Alternativa sin afectar a nadie: restaura el respaldo en tu PC (sección 9, ensayo) y copia a mano los datos que falten.

### 7.5 Falla el respaldo

**Señales:** alerta de Healthchecks.io; `offsite-backup-failed` en el log.

1. Lee el error en el log:
   - `S3 respondió 403`: llave de R2 vencida, revocada o sin permiso. Crea una nueva (ver [SECRETOS.md](SECRETOS.md)) y actualiza las variables.
   - `S3 respondió 404`: el bucket no existe o el nombre está mal.
   - `Falta SCORTA_BACKUP_KEY` u `offsite-backup-disabled`: falta una variable.
2. Mientras se arregla, haz un respaldo manual (sección 3) y descárgalo a tu PC.
3. Confirma que Healthchecks vuelve a verde en la siguiente hora.

### 7.6 Avisar a los almacenes

**Cuándo:** si el corte supera 15 minutos, si hay que restaurar (se pierden datos) o si hay un incidente de seguridad.
**Por dónde:** WhatsApp Business del soporte (lista de difusión con el contacto de cada almacén) y, si existe, la página de estado.

**Plantilla — inicio:**

> Hola, [nombre]. Te escribimos de SCORTA. Desde las [hora] el sistema presenta una falla y no permite [entrar / registrar ventas]. Ya estamos trabajando en ello. Mientras tanto, anota las ventas en papel (producto, cantidad, valor y medio de pago) para registrarlas después. Te avisaremos apenas vuelva. Disculpa las molestias.

**Plantilla — restauración (se perdieron datos):**

> Hola, [nombre]. SCORTA ya funciona de nuevo desde las [hora]. Para recuperarlo tuvimos que volver a la copia de las [hora del respaldo]. Las ventas, compras o ajustes registrados **entre las [hora del respaldo] y las [hora de la caída]** no quedaron guardados: por favor revisa y vuelve a registrarlos. Todos deben volver a iniciar sesión. Si necesitas ayuda, respóndenos por aquí.

**Plantilla — fin:**

> Hola, [nombre]. SCORTA funciona con normalidad desde las [hora]. La causa fue [explicación corta]. No se perdió información. Gracias por tu paciencia.

---

## 8. Despliegues y rollback

### 8.1 Desplegar

1. El cambio entra a `main` solo por *pull request* con CI en verde (OPS-05).
2. Revisa la lista de regresión (QA-02) y anota la versión (commit) que se despliega.
3. Despliega fuera del horario de los almacenes (por ejemplo, antes de las 7:00 o después de las 20:00 hora de Colombia). Con disco, **cada deploy corta el servicio** unos segundos o minutos.
4. Al arrancar, el servicio hace un respaldo local (`startup-*.sqlite`).
5. Después del deploy ejecuta la prueba de humo desde tu PC:
   ```sh
   npm run smoke -- https://<dominio>
   ```
   Debe terminar sin `FALLA`. Luego entra y haz una venta de prueba en tu empresa propia.

### 8.2 Rollback

1. Render → servicio → *Events* → el deploy anterior que funcionaba → **Rollback**.
2. Si el deploy malo alcanzó a **dañar datos**, restaura además el `startup-*.sqlite` creado al arrancar ese deploy (sección 5, paso 2). Ojo: se pierden las ventas hechas después de ese arranque.
3. Ejecuta la prueba de humo y avisa a los almacenes si notaron el problema.

---

## 9. Ensayo trimestral de restauración

**Cuándo:** antes del primer cliente (OPS-02) y luego cada 3 meses (enero, abril, julio, octubre).
**Objetivo:** comprobar que los respaldos sirven, que la llave funciona y medir el RTO real.

1. Descarga del bucket el respaldo `.sqlite.enc` más reciente.
2. En tu PC (con Node 24 y el código de SCORTA), en una carpeta vacía:
   ```sh
   SCORTA_BACKUP_KEY='<llave del gestor de contraseñas>' node platform-backup.mjs decrypt respaldo.sqlite.enc ensayo/platform.sqlite
   DATA_DIR=./ensayo HOST=127.0.0.1 PORT=3001 node server.mjs
   ```
3. Abre `http://127.0.0.1:3001`, entra como propietario y revisa: número de empresas, última venta de dos empresas y que el inventario cuadra.
4. Cierra el servidor y **borra la carpeta `ensayo`** (tiene datos reales).
5. Una vez al año, haz el ensayo completo en un **staging** de Render (OPS-09) siguiendo la sección 5, con cronómetro.
6. Registra el resultado:

| Fecha | Respaldo usado | ¿Descifró? | ¿Datos correctos? | Tiempo total | Responsable | Observaciones |
|---|---|---|---|---|---|---|
| | | | | | | |

---

## Antes del primer cliente

- [ ] Plan pago con disco, `DATA_DIR` y región elegida (US-05, US-06, US-07).
- [ ] Un deploy de prueba: los datos sobreviven.
- [ ] Variables del respaldo configuradas; el log muestra `offsite-backup-enabled` y luego `offsite-backup`.
- [ ] Healthchecks.io y UptimeRobot avisando al celular (US-44).
- [ ] Llave de cifrado guardada fuera de Render.
- [ ] Primer ensayo de restauración hecho y RTO medido (OPS-02).
- [ ] IP real comprobada (QA-07).
- [ ] `SCORTA_OWNER_PASSWORD` borrada de Render tras el primer arranque.
- [ ] 2FA en Render, Cloudflare, GitHub, R2 y correo (US-09).

---

## Anexo: instalación propia (Docker y Caddy)

Esta opción **no se usa en Render**. Sirve si algún día se instala SCORTA en un servidor propio o en el computador de un almacén. Los archivos `Dockerfile`, `compose.yaml` y `Caddyfile` siguen en el repositorio.

1. En el servidor, copia `.env.example` a `.env` y completa `DOMAIN`, las variables del propietario y las del respaldo. Deja `.env` legible solo por la cuenta del servicio.
2. Apunta el dominio al servidor y abre los puertos 80 y 443.
3. Valida sin mostrar secretos: `docker compose config --quiet`.
4. Inicia: `docker compose up -d --build`. Caddy obtiene el certificado HTTPS y envía el tráfico a la app; el puerto 3000 no se publica.
5. Comprueba que el volumen `/data` sea escribible por el usuario `node` del contenedor:
   ```sh
   docker compose exec -T app node --input-type=module -e "import {accessSync,constants} from 'node:fs'; accessSync('/data',constants.R_OK|constants.W_OK); console.log('Directorio persistente accesible')"
   ```
6. Detrás de Caddy, usa `SCORTA_CLIENT_IP_HEADER=x-forwarded-for` y `SCORTA_TRUSTED_PROXY_HOPS=1`.

**Respaldo:** el mismo respaldo externo cifrado funciona si configuras las variables `SCORTA_S3_*` y `SCORTA_BACKUP_KEY`. Respaldo manual:

```sh
docker compose exec -T app node platform-backup.mjs save /data/platform.sqlite /data/backups
docker compose cp app:/data/backups/. ./backups/
```

**Restauración:**

```sh
docker compose stop app
docker compose run --rm --no-deps app node platform-backup.mjs restore /data/backups/ARCHIVO.sqlite /data/platform.sqlite --offline
docker compose up -d app
```

**Nunca** uses `docker compose down -v`: borra los volúmenes con los datos.
