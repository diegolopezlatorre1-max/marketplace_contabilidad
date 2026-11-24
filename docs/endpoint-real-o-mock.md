# Endpoint real o mock · Módulo de Contabilidad

La API que implementa el [Contrato API v1](contrato-api-v1.md) se puede consumir de dos formas: el endpoint **real**, desplegado en Render, y el endpoint **mock**, que corre en local con autenticación de prueba. Las rutas, los cuerpos y los errores son los mismos en ambos; cambian la URL base y la forma de autenticarse.

## 1. Resumen

| Elemento | Real (Render) | Mock (local) |
|---|---|---|
| Base URL | `https://<servicio>.onrender.com/api/contabilidad` | `http://localhost:3000/api/contabilidad` |
| Swagger | `https://<servicio>.onrender.com/docs` | `http://localhost:3000/docs` |
| OpenAPI | `https://<servicio>.onrender.com/openapi.json` | `http://localhost:3000/openapi.json` |
| Health | `https://<servicio>.onrender.com/health` | `http://localhost:3000/health` |
| Base de datos | PostgreSQL de Supabase (esquema `contabilidad`) | PostgreSQL local o en Docker |
| Usuarios | Access token de Supabase Auth (`AUTH_MODE=jwks`) | Tokens fijos `mock-*` (`AUTH_MODE=mock`) |
| Módulos que envían eventos | `x-api-key` con su clave de `SERVICE_API_KEYS` | `Authorization: Bearer mock-sistema` |
| Otros módulos (Órdenes, Pagos, Vendedores) | Simulados (`INTEGRATION_MODE=mock`) | Simulados (`INTEGRATION_MODE=mock`) |

## 2. Endpoint real (Render)

Definido en `render.yaml`: servicio web `marketplace-contabilidad-api`, imagen Docker de `apps/api/Dockerfile`, rama `main` con despliegue automático, región Oregon, plan gratuito.

- Cada despliegue aplica las migraciones pendientes (`node dist/migrate.js`) y luego arranca la API. Si una migración falla, sigue activo el despliegue anterior.
- Render vigila `GET /health`.
- Con `NODE_ENV=production` el arranque falla si `AUTH_MODE=mock` o si falta `SERVICE_API_KEYS`, así que el endpoint real nunca acepta tokens de prueba.
- Los secretos (`DATABASE_URL`, `DATABASE_SSL_CA`, `SUPABASE_URL`, `SERVICE_API_KEYS`, `OUTBOX_DESTINOS`, `OUTBOX_API_KEY`, `CORS_ORIGINS`) se cargan en Render y no están en Git.
- El plan gratuito se suspende tras 15 minutos sin tráfico; la primera petición después puede tardar cerca de un minuto.

**Autenticación**

| Consumidor | Cabecera |
|---|---|
| Usuarios (ADMIN, VENDEDOR) | `Authorization: Bearer <access token de Supabase>`. El rol sale de `app_metadata.role` (`admin`, `vendedor`, `comprador`). |
| Órdenes, Pagos | `x-api-key: <clave entregada a cada módulo>` |

**Verificación**

```bash
curl https://<servicio>.onrender.com/health
# 200 { "status": "ok", "modulo": "contabilidad", "checks": { "baseDeDatos": "ok" }, ... }
```

En `/docs` deben aparecer `POST /api/contabilidad/escrow/marcar-entrega/{pedidoId}` y `POST /api/contabilidad/escrow/bloquear/{pedidoId}`.

## 3. Endpoint mock (local)

Sirve para probar el contrato sin Supabase ni claves. Es la misma API con `AUTH_MODE=mock`.

```bash
docker compose up --build        # PostgreSQL + API con migraciones y datos de ejemplo
```

Sin Docker:

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:create && npm run db:migrate && npm run db:seed
npm run dev:api                  # http://localhost:3000/api/contabilidad
```

**Tokens de prueba** (`Authorization: Bearer <token>`)

| Token | Rol | Uso |
|---|---|---|
| `mock-admin` | ADMIN | Comisiones, consultas, conciliación, ajustes, pagos, auditoría |
| `mock-vendedor` | VENDEDOR (vendedor `V-1`) | Su estado financiero y sus pagos |
| `mock-comprador` | COMPRADOR | Sin acceso contable (sirve para probar `403`) |
| `mock-sistema` | Servicio | Eventos de Órdenes y Pagos, escrow de servicio |

**Ejemplo**

```bash
curl -X POST http://localhost:3000/api/contabilidad/eventos/orden-confirmada \
  -H "Authorization: Bearer mock-sistema" -H "Content-Type: application/json" \
  -d '{"eventId":"evt-ord-0001","version":1,"tipo":"orden.confirmada",
       "ocurridoEn":"2026-11-20T15:30:00-05:00","numeroOrden":"ORD-1001",
       "fecha":"2026-11-20T15:29:00-05:00","estado":"CONFIRMADA","moneda":"COP",
       "lineas":[{"vendedorId":"V-001","valorBruto":"150000.00","categoriaId":"CAT-01"}]}'
# 201 { "eventId": "evt-ord-0001", "resultado": "PROCESADO" }
```

La colección `docs/postman/contabilidad.postman_collection.json` recorre todos los endpoints contra el mock (`npx newman run docs/postman/contabilidad.postman_collection.json`).

## 4. Qué es simulado

- **En ambos endpoints:** los datos de Órdenes, Pagos y Vendedores (`INTEGRATION_MODE=mock`). Contabilidad recibe los eventos por HTTP, pero no consulta a esos módulos.
- **Solo en el mock:** la autenticación. Los tokens `mock-*` no existen en el endpoint real.
- **Eventos salientes:** quedan en el outbox hasta que se configure `OUTBOX_DESTINOS`. `GET /health` muestra cuántos están pendientes.

## 5. Cómo cambiar de uno a otro

Un consumidor solo cambia la URL base y la cabecera de autenticación. En Postman basta con editar las variables `baseUrl` y los tokens de la colección.
