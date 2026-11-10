# FRAGOLA PRENOTA · 7.1

Aplicación de reservas para barberías, spas y salones. Incluye demostración local y conexión a Supabase para uso compartido.

## Iniciar

Instala Node.js 22 o superior. En esta carpeta ejecuta:

```powershell
npm ci
npm start
```

Abre http://127.0.0.1:8765. El servidor es de desarrollo y escucha solo en tu equipo.

## Configuración

`config.js` conserva la URL y la clave pública de Supabase que estaban en el archivo recibido. No se ha verificado la titularidad ni el estado de ese proyecto. Confirma que es tuyo antes de introducir datos reales. La configuración ya no está mezclada con el código de la app.

Para probar sin servidor, copia `config.example.js` como `config.js`: sus campos vacíos activan la demostración local. Los datos locales solo existen en ese navegador; no sirven para recibir reservas desde otros dispositivos.

Para producción, escribe en `config.js` la URL y la clave pública de tu proyecto. Nunca uses claves `service_role` o `secret`.

## Verificar y publicar

```powershell
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Publica **solo el contenido de `dist/`**. Incluye `index.html` y `config.js`; no necesita un servidor Node en producción. En GitHub Pages, selecciona **GitHub Actions** como origen: `.github/workflows/pages.yml` verifica y publica los cambios de `main`.

Consulta [GUIA-INSTALACION.md](GUIA-INSTALACION.md) para configurar Supabase y [docs/REVISION.md](docs/REVISION.md) para los cambios y pendientes.

## Estructura

- `index.html`: interfaz y lógica de la aplicación.
- `config.js` y `config.example.js`: configuración pública y ejemplo local.
- `supabase/`: esquema inicial y parche de permisos para instalaciones anteriores.
- `pruebas/`: pruebas de SQL, sincronización, HTTP e interfaz.
- `scripts/build.mjs`: prepara los archivos publicables.
- `docs/`: revisión actual, capturas e informes históricos.

Los informes v6.4 y v7 son antecedentes entregados con el proyecto; sus resultados no sustituyen las verificaciones de esta revisión.
