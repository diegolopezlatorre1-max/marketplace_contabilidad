# Imagen de la API para Render y para desarrollo local (docker compose). Contexto: raíz del monorepo.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @contabilidad/api

FROM node:22-alpine
WORKDIR /app
# Se conservan las dependencias de desarrollo: el compose corre con
# NODE_ENV=development (AUTH_MODE=mock y logs con pino-pretty).
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/migrations apps/api/migrations
COPY --from=build /app/apps/api/seeds apps/api/seeds
WORKDIR /app/apps/api
USER node
EXPOSE 3000
# Aplica las migraciones pendientes (idempotentes) y arranca la API. Si una migración falla, el
# contenedor termina sin arrancar la API (en Render sigue activo el despliegue anterior).
# `exec` deja a node como PID 1 para que reciba SIGTERM y cierre de forma ordenada.
# Va en la imagen y no en el "Docker Command" de Render: ese campo dejaba las comillas de
# `sh -c "..."` literales y el contenedor fallaba con status 127.
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/main.js"]
