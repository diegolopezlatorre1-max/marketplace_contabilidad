# Marketplace — Módulo de Contabilidad

Registra contablemente lo que ocurre en el marketplace: ventas confirmadas, comisiones,
cuentas por pagar a vendedores, conciliación de pagos y ajustes por devoluciones.

- Plan de desarrollo: [`docs/Plan_Desarrollo_Modulo_Contabilidad.txt`](docs/Plan_Desarrollo_Modulo_Contabilidad.txt)
- Decisiones de la Fase 0: [`docs/fase0/decisiones.md`](docs/fase0/decisiones.md)
- Contratos con otros módulos: [`docs/fase0/contratos-integracion.md`](docs/fase0/contratos-integracion.md)
- Decisiones de arquitectura: [`docs/adr/`](docs/adr)
- Plan del Sprint 1 (tareas y responsables): [`docs/sprint1/plan-sprint1.md`](docs/sprint1/plan-sprint1.md)
- Plan y cierre del Sprint 2: [`docs/sprint2/plan-sprint2.md`](docs/sprint2/plan-sprint2.md)
- Plan y cierre del Sprint 3: [`docs/sprint3/plan-sprint3.md`](docs/sprint3/plan-sprint3.md) (Excel: [`Planeacion_Sprint3_Contabilidad.xlsx`](docs/sprint3/Planeacion_Sprint3_Contabilidad.xlsx))

## Estado

| Fase | Contenido                       | Estado                                    |
| ---- | ------------------------------- | ----------------------------------------- |
| 0    | Decisiones y contratos          | Hecha; Sprint 1 desbloqueado (2026-10-08) |
| 1    | Fundaciones técnicas            | Hecha                                     |
| 2    | Sprint 1: HU-CON-09, 01, 02, 03 | Hecha (2026-10-23)                        |
| 3    | Sprint 2: HU-CON-06, 04, 05     | Hecha (2026-11-06)                        |
| 4    | Sprint 3: HU-CON-10, 07, 08, 11 | Hecha (2026-11-06)                        |
| 5    | Endurecimiento e integración    | Siguiente: 2026-11-23 a 2026-12-04        |

## Estructura

```
apps/api            API REST (Node + Express + TypeScript), arquitectura hexagonal
  src/domain          reglas contables puras (Money, Porcentaje, Periodo...)
  src/application     casos de uso y puertos
  src/infrastructure  adaptadores: Express, PostgreSQL, auth, integraciones
  src/bootstrap       composition root (createContabilidadModule) y main
  migrations          migraciones SQL versionadas
apps/web            Frontend React (Vite) de demostración — CONGELADO, fuera del entregable (ver abajo)
packages/contracts  Esquemas Zod y tipos compartidos (eventos, errores, DTOs)
```

### Alcance: solo backend (`apps/web` congelado)

Según [`docs/integracion/GUIA_EQUIPO_6.md`](docs/integracion/GUIA_EQUIPO_6.md) (sección 4), **el
alcance del módulo es el backend; no se construye interfaz gráfica**. El entregable es la API
(`apps/api`), su contrato OpenAPI (`/docs`, `/openapi.json`) y los contratos de eventos. La interfaz
la construye el marketplace consumiendo la API con el access token de Supabase.

`apps/web` se conserva **congelado**:

- No recibe funcionalidades nuevas ni se adapta a los cambios del backend (roles de Vendedor y
  Comprador, login con Supabase, escrow). Solo se mantiene compilando para que la CI siga pasando.
- Sirve para demostrar la API en local con `AUTH_MODE=mock` (login de prueba como Administrador).
- No debe desplegarse ni presentarse como parte del módulo.

## Puesta en marcha

### Con Docker (todo en contenedores)

```bash
docker compose up --build   # postgres + api (migraciones y seeds) + web
```

- API: http://localhost:3000/api/contabilidad · Web de demostración (congelada): http://localhost:8080
- Si ya hay un PostgreSQL local en el puerto 5432: `POSTGRES_PORT=5433 docker compose up --build`.

### Sin Docker (desarrollo con recarga en caliente)

Requisitos: Node.js 20+ y PostgreSQL 14+ (local o `docker compose up -d postgres`).

```bash
npm install
cp apps/api/.env.example apps/api/.env   # ajustar usuario/contraseña de PostgreSQL
npm run db:create                        # crea la BD de desarrollo y la de pruebas
npm run db:migrate                       # aplica migraciones
npm run db:seed                          # datos de ejemplo (apps/api/seeds, idempotentes)
npm run dev:api                          # http://localhost:3000/api/contabilidad
npm run dev:web                          # demo congelada (opcional): http://localhost:5173
```

- Documentación de la API (Swagger): http://localhost:3000/docs · contrato: http://localhost:3000/openapi.json
- Health check: http://localhost:3000/health
- El prefijo anterior `/api/v1/contabilidad` sigue respondiendo como alias obsoleto (cabecera
  `Deprecation: true`) mientras los demás equipos migran a `/api/contabilidad`.
- Límite de peticiones por IP (`RATE_LIMIT_*`): 300/min general, 3000/min en `/eventos/*` y
  20/min en `/exportaciones/*`; al superarlo responde 429 `DEMASIADAS_PETICIONES`.
- Autenticación de desarrollo (`AUTH_MODE=mock`): `Authorization: Bearer mock-admin` (ADMIN),
  `mock-vendedor` (VENDEDOR, vendedor V-1), `mock-comprador` (COMPRADOR) o `mock-sistema`
  (servicio: módulos que envían eventos). El frontend ofrece un login de prueba.
- Autenticación real, dos variantes con el access token de Supabase Auth:
  - `AUTH_MODE=jwks` (la que se despliega): verifica firma (ES256/RS256), expiración, emisor
    `<SUPABASE_URL>/auth/v1` y audiencia `authenticated` con las claves públicas de
    `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`. Solo requiere `SUPABASE_URL`.
  - `AUTH_MODE=supabase`: valida con `getClaims` de supabase-js (`SUPABASE_URL` y
    `SUPABASE_PUBLISHABLE_KEY`); además acepta tokens HS256 consultando a Supabase.

  En ambas el rol se lee de `app_metadata.role` (`admin`, `vendedor`, `comprador`). Para comprobarlo con
  usuarios reales: `npm run probar:auth` (ver `docs/postman/README.md`). Los módulos que envían eventos usan la
  cabecera `x-api-key` con su clave de `SERVICE_API_KEYS`.

### Eventos salientes (outbox)

Los eventos (venta registrada, ajuste, pago acreditado al vendedor, conciliación, escrow) se guardan
en `contabilidad.outbox` en la misma transacción del cambio. El relay los entrega por HTTP POST a las
URL de `OUTBOX_DESTINOS`, con reintentos (espera exponencial) y `DEAD_LETTER` tras
`OUTBOX_MAX_INTENTOS` fallos. `GET /health` informa cuántos hay pendientes y en dead-letter. Sin
destinos configurados, los eventos quedan pendientes hasta que se configure uno. Contrato en
`docs/fase0/contratos-integracion.md`.

### Base de datos en Supabase

El módulo usa su propio esquema `contabilidad` dentro del proyecto Supabase compartido; no toca
Auth, usuarios ni las tablas de otros equipos.

1. En `apps/api/.env`, `DATABASE_URL` = cadena del **Session pooler** (botón _Connect_) y
   `DATABASE_SSL=verify` (con `DATABASE_SSL_CA` = certificado de _Database Settings → SSL_;
   `no-verify` solo si no se dispone del certificado).
2. `npm run db:migrate` crea el esquema y, con `008_rls.sql`, habilita RLS en todas sus tablas y
   retira los permisos de `anon` y `authenticated`: nadie puede leerlas con la API de datos de
   Supabase. El backend se conecta con el rol dueño de las tablas y aplica la autorización por rol
   y por vendedor antes de cada consulta.
3. Si el administrador prefiere ejecutar el SQL él mismo, entréguele los archivos de
   `apps/api/migrations/` en orden.

Toda tabla nueva debe habilitar RLS en su migración: la prueba `test/integration/rls.test.ts`
falla si alguna queda sin él.

### Despliegue en Render

`render.yaml` define el servicio (Docker con `apps/api/Dockerfile`, health check en `/health`).

1. Render → _New_ → _Blueprint_ → este repositorio (rama `main`).
2. Completar los secretos que pide Render: `DATABASE_URL`, `DATABASE_SSL_CA`, `SUPABASE_URL`
   (`https://<ref>.supabase.co`), `SERVICE_API_KEYS`, `OUTBOX_DESTINOS` (destino de Notificaciones)
   y `OUTBOX_API_KEY`. Ningún secreto va en Git.
3. Cada despliegue ejecuta `node dist/migrate.js` (migraciones pendientes) y luego la API: lo
   hace el `CMD` del Dockerfile, así que el _Docker Command_ de Render debe quedar vacío. Con
   `NODE_ENV=production` el arranque falla si falta `SERVICE_API_KEYS` o si `AUTH_MODE=mock`.
4. Verificar antes de entregar las URL a otros equipos:
   - `GET https://marketplace-contabilidad-api.onrender.com/health` → `200`
   - `https://marketplace-contabilidad-api.onrender.com/docs` → Swagger
   - `POST /api/contabilidad/escrow/marcar-entrega/{pedido_id}` y `.../bloquear/{pedido_id}`
     aparecen en Swagger.

URL a entregar: `https://marketplace-contabilidad-api.onrender.com/api` (base) y `https://marketplace-contabilidad-api.onrender.com/docs`.
El plan gratuito se suspende tras 15 min sin tráfico: la primera petición puede tardar ~1 min.

> **Servicio actual:** se creó como _Public Git Repository_ (rama `main`, región Virginia, Docker
> Command vacío), no con el Blueprint. No se despliega solo: después de cada merge a `main` use
> _Manual Deploy → Deploy latest commit_. Las migraciones se aplican al arrancar el contenedor.

## Calidad

```bash
npm run lint              # ESLint (incluye reglas de capas hexagonales)
npm run typecheck
npm test                  # pruebas unitarias (api, web, contracts)
npm run test:integration  # pruebas contra PostgreSQL (usa TEST_DATABASE_URL)
npm run test:integration:docker  # igual, en un contenedor efímero (Testcontainers, requiere Docker)
npm run build
```

## Integración con el marketplace

```ts
// Backend (monolito modular):
const { router } = createContabilidadModule({ config, pool, logger });
app.use('/api/contabilidad', router);

// Frontend:
<Route path="/contabilidad/*" element={
  <ContabilidadModule apiBaseUrl="/api/contabilidad" getToken={getToken} />
} />
```

Ver la sección 5 del plan de desarrollo y `docs/adr/0001-arquitectura-hexagonal.md`.
