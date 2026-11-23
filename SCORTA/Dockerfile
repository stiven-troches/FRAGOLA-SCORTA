# syntax=docker/dockerfile:1
# Imagen base fijada por digest (índice multiarquitectura de node:24-alpine, consultado en Docker Hub el 2026-11-21).
# Dependabot (ecosistema docker en .github/dependabot.yml) propone las actualizaciones del digest.

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY *.html *.mjs ./
COPY src ./src
COPY scripts ./scripts
# Vite copia public/ (sw.js, manifiesto, iconos) dentro de dist.
COPY public ./public
RUN npm run build

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
# tini como PID 1: reenvía SIGTERM al proceso de Node y recoge procesos huérfanos.
RUN apk add --no-cache tini
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
# El servidor solo usa módulos nativos de Node (node:sqlite, node:http...): no necesita node_modules.
COPY package.json ./
COPY --from=build /app/dist ./dist
# Todos los módulos del servidor (*.mjs de la raíz) y la carpeta ops/ (scripts operativos).
COPY *.mjs ./
COPY ops ./ops
# Módulos de src/ que platform.mjs importa en el servidor y fotos que lee la semilla de la empresa de prueba.
# Si el servidor empieza a importar otro archivo de src/, agrégalo aquí.
COPY src/renewal.mjs src/recovery.mjs ./src/
COPY public/test-shop ./public/test-shop
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.mjs"]
