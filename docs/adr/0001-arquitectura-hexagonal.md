# ADR 0001 — Arquitectura hexagonal en un monorepo

- Estado: Aceptada
- Fecha: 2026-10-05

## Contexto

El marketplace se construye por módulos y equipos. El módulo de contabilidad debe
desarrollarse antes de que existan Órdenes, Pagos y Vendedores, y conectarse a ellos
más adelante sin reescribir sus reglas contables.

## Decisión

- Monorepo con npm workspaces: `apps/api` (Node + Express + TypeScript),
  `apps/web` (React + Vite + TypeScript) y `packages/contracts` (esquemas Zod y tipos
  compartidos).
- La API sigue la arquitectura de puertos y adaptadores:
  - `domain/`: reglas contables puras (Money, Porcentaje, Periodo, entidades).
  - `application/`: casos de uso y puertos (`ports/in`, `ports/out`).
  - `infrastructure/`: adaptadores (Express, PostgreSQL, mocks/HTTP de otros módulos).
  - `bootstrap/container.ts`: composition root (`createContabilidadModule`).
- Las dependencias apuntan hacia adentro; ESLint (`no-restricted-imports`) impide
  importar infraestructura desde `domain/` o `application/`.
- Los adaptadores se eligen por configuración: `INTEGRATION_MODE=mock|http|events`
  y `AUTH_MODE=mock|jwt`.
- Esquema PostgreSQL propio `contabilidad`; sin JOIN con tablas de otros módulos.
- El router Express es autocontenido (auth, validación y errores incluidos) para
  poder montarlo como microservicio o dentro de un monolito modular.
- El frontend expone `<ContabilidadModule/>` con rutas relativas.

## Consecuencias

- Más archivos e interfaces que un CRUD directo, a cambio de un dominio testeable
  en memoria y una integración que solo cambia adaptadores.
- Cada sprint agrega repositorios a `TransactionalRepositories` y casos de uso al
  composition root.
