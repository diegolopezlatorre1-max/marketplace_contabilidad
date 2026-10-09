# Sprint 1 — Registro contable básico

**Fechas:** 2026-10-12 a 2026-10-23 (2 semanas) · **Carga:** 18 pts · **Equipo:** Carlos, Diego

**Objetivo:** las ventas confirmadas se registran automáticamente, con su comisión, y el
saldo pendiente por vendedor es visible.

## Reparto

| HU | Pts | Responsable | Por qué |
|----|-----|-------------|---------|
| HU-CON-09 Configurar % de comisión | 3 | **Carlos** | Es la primera de la cadena; la HU-01 la necesita para calcular. |
| HU-CON-01 Registrar venta confirmada | 5 | **Carlos** | Dueño del caso de uso que orquesta todo el flujo en una transacción. |
| HU-CON-02 Calcular comisión | 5 | **Diego** | Dominio puro: puede empezar el día 1 sin esperar a la HU-01. |
| HU-CON-03 Cuentas por pagar | 5 | **Diego** | Continúa la HU-02 (usa el neto calculado). |
| **Total** | **18** | Carlos 8 · Diego 10 | Carlos asume además la integración del flujo (T-09). |

El punto de unión es `RegistrarVentaConfirmadaUseCase` (Carlos): llama a la calculadora de
comisión y a la generación de la cuenta por pagar (Diego) dentro de la misma `UnitOfWork`.
Para no bloquearse, el **día 1** se acuerdan esas interfaces (ver "Acuerdos").

## Tareas

Estado: ⬜ pendiente · 🔄 en progreso · ✅ hecha

### HU-CON-09 — Carlos

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-01 | `ConfiguracionComision` (porcentaje, alcance, vigencias) y regla de no solapamiento; al crear una nueva se cierra la anterior. Pruebas unitarias. | Dominio | ⬜ |
| T-02 | Migración `002_configuracion_comision.sql` y `PgConfiguracionComisionRepository` (implementa el puerto `CommissionConfigProvider`). | BD / Infra | ⬜ |
| T-03 | `ConfigurarComisionUseCase` (con auditoría) y `ObtenerComisionVigenteQuery`. | Aplicación | ⬜ |
| T-04 | `GET/PUT /comisiones/configuracion` (PUT solo ADMIN_FINANCIERO), DTOs en `packages/contracts`, OpenAPI, pruebas de integración. | API | ⬜ |
| T-05 | Pantalla `/configuracion/comision` con historial de vigencias. | Web | ⬜ |
| T-06 | Seed `010_comision_global.sql` (10 % global desde 2026-01-01). | Seeds | ⬜ |

### HU-CON-01 — Carlos

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-07 | `VentaContable` (solo acepta estado CONFIRMADA). Pruebas unitarias. | Dominio | ⬜ |
| T-08 | Migración `003_venta_contable.sql` con UNIQUE (numero_orden, vendedor_id) y `PgVentaContableRepository`. | BD / Infra | ⬜ |
| T-09 | `RegistrarVentaConfirmadaUseCase`: inbox → validar estado (si no, `evento_ignorado`) → una venta por línea/vendedor → comisión y cuenta por pagar (puertos de Diego) en la misma UoW → auditoría y outbox `contabilidad.venta.registrada`. | Aplicación | ⬜ |
| T-10 | `POST /eventos/orden-confirmada` (rol SISTEMA) y `GET /ventas?desde=&hasta=&vendedorId=&page=&size=`. | API | ⬜ |
| T-11 | `MockOrdersGateway` y simulador de órdenes (script `npm run simular:orden`). | Integración | ⬜ |
| T-12 | Pantalla `/ventas`: listado con filtros. | Web | ⬜ |
| T-13 | Pruebas: orden nueva se registra; evento repetido → YA_PROCESADO; orden "pendiente" → IGNORADO; multi-vendedor → N ventas; dos eventos simultáneos → un solo registro. | Pruebas | ⬜ |

### HU-CON-02 — Diego

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-14 | `CalculadoraComision`: comisión = round(bruto × %), neto = bruto − comisión; guarda el % aplicado. Pruebas con `fast-check` (bruto = comisión + neto). | Dominio | ⬜ |
| T-15 | Migración `004_comision.sql` (venta_id UNIQUE FK) con CHECK bruto = comisión + neto. | BD | ⬜ |
| T-16 | `PgComisionRepository` y su uso dentro de T-09 (en pareja con Carlos). | Infra | ⬜ |
| T-17 | `GET /ventas/{id}`: bruto, % aplicado, comisión y neto. DTO en contracts. | API | ⬜ |
| T-18 | Pantalla `/ventas/:id` con el desglose. | Web | ⬜ |
| T-19 | Pruebas: $100.000 al 10 % → 10.000 / 90.000; cambiar de 10 % a 12 % no altera ventas previas; valores con decimales cuadran. | Pruebas | ⬜ |

### HU-CON-03 — Diego

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-20 | `CuentaPorPagar` (PENDIENTE / PARCIAL / PAGADA) con el periodo quincenal de `Periodo.ts`. Pruebas unitarias. | Dominio | ⬜ |
| T-21 | Migración `005_cuenta_por_pagar.sql` con índices (vendedor_id, periodo, estado). | BD | ⬜ |
| T-22 | `GenerarCuentaPorPagar` (llamado desde T-09), `ListarCuentasPorPagarQuery` y `ResumenSaldoVendedorQuery`. | Aplicación | ⬜ |
| T-23 | Puerto `SellersGateway` y adaptador mock (nombre / razón social del vendedor). | Integración | ⬜ |
| T-24 | `GET /cuentas-por-pagar?vendedorId=&periodo=&estado=` y `GET /cuentas-por-pagar/resumen?periodo=`. | API | ⬜ |
| T-25 | Pantalla `/cuentas-por-pagar`: resumen por vendedor y periodo, detalle y filtro por estado. | Web | ⬜ |
| T-26 | Prueba: ventas netas de 90.000 y 45.000 → saldo 135.000. | Pruebas | ⬜ |

### Compartidas

| ID | Tarea | Responsable | Estado |
|----|-------|-------------|--------|
| T-27 | Acordar las interfaces del día 1 (ver "Acuerdos") y dejarlas en código como puertos vacíos. | Carlos + Diego | ⬜ |
| T-28 | Prueba de integración del flujo completo: evento → venta → comisión → cuenta por pagar. | Carlos + Diego | ⬜ |
| T-29 | Revisión cruzada: cada PR lo aprueba el otro integrante. | Carlos + Diego | ⬜ |
| T-30 | Demo con datos de ejemplo y validación del Contador. | Carlos (presenta) + Diego | ⬜ |

## Calendario sugerido

| Días | Carlos | Diego |
|------|--------|-------|
| Lun 12 | T-27 interfaces (en pareja) | T-27 interfaces (en pareja) |
| Mar 13 – Vie 16 | HU-09 completa (T-01 a T-06); T-07, T-08 | T-14, T-15, T-20, T-21 (dominio y migraciones) |
| Lun 19 – Mar 20 | T-09 con T-16 y T-22 en pareja; T-10, T-11 | T-16, T-22, T-23, T-17, T-24 |
| Mié 21 – Jue 22 | T-12, T-13, T-28 | T-18, T-25, T-19, T-26, T-28 |
| Vie 23 | T-30 demo | T-30 demo |

## Acuerdos para trabajar en paralelo

- **Migraciones:** numeración reservada para evitar choques: Carlos 002 y 003, Diego 004 y
  005 (`comision` tiene FK a `venta_contable`, por eso va después).
- **Interfaces del día 1 (T-27),** en `apps/api/src/application/ports/out/`:
  - `CommissionConfigProvider.obtenerVigente(fecha, vendedorId, categoriaId?)` → `Porcentaje` (Carlos).
  - `CalculadoraComision.calcular(valorBruto: Money, porcentaje: Porcentaje)` → `{ comision, neto, porcentajeAplicado }` (Diego, dominio).
  - `ComisionRepository.guardar(...)` y `CuentaPorPagarRepository.guardar(...)`, que reciben la transacción de la `UnitOfWork` (Diego).
- **Ramas:** una rama por HU desde `dev` (`feat/hu-con-09-...`); PR a `dev` con la plantilla del DoD.
- **Contracts:** cada uno agrega sus DTOs en un archivo propio de `packages/contracts/src/`
  (`comisiones.ts`, `ventas.ts`, `cuentasPorPagar.ts`) para evitar conflictos.
