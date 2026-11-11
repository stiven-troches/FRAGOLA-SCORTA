FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html ./
COPY src ./src
RUN npm run build
FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.mjs restore.mjs backup.mjs auth.mjs consultas.mjs ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node","server.mjs"]

