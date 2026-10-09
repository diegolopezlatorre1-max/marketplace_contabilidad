# Marketplace — Módulo de Contabilidad

Registra contablemente lo que ocurre en el marketplace: ventas confirmadas, comisiones,
cuentas por pagar a vendedores, conciliación de pagos y ajustes por devoluciones.

- Plan de desarrollo: [`docs/Plan_Desarrollo_Modulo_Contabilidad.txt`](docs/Plan_Desarrollo_Modulo_Contabilidad.txt)
- Decisiones de la Fase 0: [`docs/fase0/decisiones.md`](docs/fase0/decisiones.md)
- Contratos con otros módulos: [`docs/fase0/contratos-integracion.md`](docs/fase0/contratos-integracion.md)
- Decisiones de arquitectura: [`docs/adr/`](docs/adr)
- Plan del Sprint 1 (tareas y responsables): [`docs/sprint1/plan-sprint1.md`](docs/sprint1/plan-sprint1.md)

## Estado

| Fase | Contenido                       | Estado                                    |
| ---- | ------------------------------- | ----------------------------------------- |
| 0    | Decisiones y contratos          | Hecha; Sprint 1 desbloqueado (2026-10-08) |
| 1    | Fundaciones técnicas            | Hecha                                     |
| 2    | Sprint 1: HU-CON-09, 01, 02, 03 | Planeado: 2026-10-12 a 2026-10-23         |
| 3    | Sprint 2: HU-CON-06, 04, 05     | Pendiente                                 |
| 4    | Sprint 3: HU-CON-10, 07, 08, 11 | Pendiente                                 |

## Estructura

```
apps/api            API REST (Node + Express + TypeScript), arquitectura hexagonal
  src/domain          reglas contables puras (Money, Porcentaje, Periodo...)
  src/application     casos de uso y puertos
  src/infrastructure  adaptadores: Express, PostgreSQL, auth, integraciones
  src/bootstrap       composition root (createContabilidadModule) y main
  migrations          migraciones SQL versionadas
apps/web            Frontend React (Vite); se monta en el marketplace como <ContabilidadModule/>
packages/contracts  Esquemas Zod y tipos compartidos (eventos, errores, DTOs)
```

## Puesta en marcha

### Con Docker (todo en contenedores)

```bash
docker compose up --build   # postgres + api (migraciones y seeds) + web
```

- Web: http://localhost:8080 · API: http://localhost:3000/api/v1/contabilidad
- Si ya hay un PostgreSQL local en el puerto 5432: `POSTGRES_PORT=5433 docker compose up --build`.

### Sin Docker (desarrollo con recarga en caliente)

Requisitos: Node.js 20+ y PostgreSQL 14+ (local o `docker compose up -d postgres`).

```bash
npm install
cp apps/api/.env.example apps/api/.env   # ajustar usuario/contraseña de PostgreSQL
npm run db:create                        # crea la BD de desarrollo y la de pruebas
npm run db:migrate                       # aplica migraciones
npm run db:seed                          # datos de ejemplo (apps/api/seeds, idempotentes)
npm run dev:api                          # http://localhost:3000/api/v1/contabilidad
npm run dev:web                          # http://localhost:5173
```

- Documentación de la API (Swagger): http://localhost:3000/api/v1/contabilidad/docs
- Autenticación de desarrollo (`AUTH_MODE=mock`): `Authorization: Bearer mock-contador`,
  `mock-admin` o `mock-sistema`. El frontend ofrece un login de prueba por rol.

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
app.use('/api/v1/contabilidad', router);

// Frontend:
<Route path="/contabilidad/*" element={
  <ContabilidadModule apiBaseUrl="/api/v1/contabilidad" getToken={getToken} />
} />
```

Ver la sección 5 del plan de desarrollo y `docs/adr/0001-arquitectura-hexagonal.md`.
