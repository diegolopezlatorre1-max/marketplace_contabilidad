# Imagen de la API para desarrollo local (docker compose). Contexto: raíz del monorepo.
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
CMD ["node", "dist/main.js"]
