# Frontend compilado y servido por nginx, que redirige /api a la API (mismo origen, sin CORS).
# Contexto: raíz del monorepo.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build -w @contabilidad/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
