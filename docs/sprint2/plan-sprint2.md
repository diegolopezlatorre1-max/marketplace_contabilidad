# Sprint 2 — Conciliación, ajustes y reporte de ingresos

**Fechas:** 2026-10-26 a 2026-11-06 (2 semanas) · **Carga:** 18 pts · **Equipo:** Carlos, Diego

**Objetivo:** los pagos recibidos se concilian contra órdenes, las devoluciones y
cancelaciones ajustan los saldos y el contador obtiene el reporte de ingresos por periodo.

## Reparto

| HU | Pts | Responsable | Por qué |
|----|-----|-------------|---------|
| HU-CON-06 Ajustes por devoluciones o cancelaciones | 5 | **Diego** | Va antes o en paralelo con la HU-05 para que el reporte incluya los ajustes desde el inicio. |
| HU-CON-04a Relacionar pago recibido con órdenes | 5 | **Carlos** | Independiente de 05 y 06: solo depende de la HU-01 y del contrato con Pagos. |
| HU-CON-04b Diferencias y estado de conciliación | 3 | **Carlos** | Continúa la 04a (`PoliticaConciliacion`). |
| HU-CON-05 Reporte de ingresos y comisiones | 5 | **Diego** | Continúa la HU-06 (descuenta los ajustes del rango). |
| **Total** | **18** | Carlos 8 · Diego 10 | Carlos asume además la integración de 05 y 06 en `dev` (PR #11). |

## Tareas

Estado: ⬜ pendiente · 🔄 en progreso · ✅ hecha

### HU-CON-04a / 04b — Carlos

Detalle completo en [`hu-con-04-plan-tareas.txt`](hu-con-04-plan-tareas.txt).

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-31 | `PagoRecibido`, `Conciliacion` y `PoliticaConciliacion` (diferencia = pago − aplicado; tolerancia D-08). Pruebas unitarias. | Dominio | ✅ |
| T-32 | Migración `006_conciliacion.sql` (`pago_recibido`, `conciliacion`, `conciliacion_detalle`) y repositorios Pg. | BD / Infra | ✅ |
| T-33 | `RegistrarPagoRecibidoUseCase` (SISTEMA, inbox), `ImportarPagosRecibidosUseCase` (CSV) y operaciones de conciliación. | Aplicación | ✅ |
| T-34 | `MockPaymentsGateway`, `CsvPaymentsImporter` y `npm run simular:pago`. | Integración | ✅ |
| T-35 | `POST /eventos/pago-recibido`, `POST /pagos-recibidos/importar`, `GET /pagos-recibidos`, `POST/GET /conciliaciones`, `GET /conciliaciones/{id}`. | API | ✅ |
| T-36 | Pantalla Conciliación: bandeja de pagos, asistente de conciliación y lista con estado y diferencia. | Web | ✅ |
| T-37 | Pruebas unitarias, de integración (`conciliaciones.test.ts`) y carpeta de Postman. | Pruebas | ✅ |

### HU-CON-06 — Diego

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-38 | `AjusteContable` (DEVOLUCION / CANCELACION): solo sobre ventas existentes, valor ≤ bruto − ajustes previos, reverso proporcional de comisión y neto con el % aplicado; nunca edita la venta original. Pruebas unitarias. | Dominio | ✅ |
| T-39 | `CuentaPorPagar.revertir()`: descuenta el neto del saldo pendiente; lo ya pagado queda como saldo a favor del marketplace (D-07). | Dominio | ✅ |
| T-40 | Migración `006_ajuste_contable.sql` y `PgAjusteContableRepository`. | BD / Infra | ✅ |
| T-41 | `RegistrarAjusteUseCase` (CONTADOR), `ProcesarAjusteOrdenUseCase` (eventos) y `ListarAjustesQuery`, con auditoría y outbox `contabilidad.ajuste.registrado`. | Aplicación | ✅ |
| T-42 | `POST/GET /ajustes`, `POST /eventos/orden-cancelada` y `POST /eventos/orden-devuelta`. DTOs en `packages/contracts/src/ajustes.ts`. | API | ✅ |
| T-43 | Pantalla de Ajustes: formulario e historial (`AjustesPage`). | Web | ✅ |
| T-44 | Pruebas: orden inexistente rechazada; devolución total de 100.000 al 10 % → comisión −10.000 y saldo −90.000; ajuste mayor al valor rechazado; parcial + parcial no excede el total; ajuste sobre cuenta pagada genera saldo a favor (`AjusteContable.test.ts`, `AjustesUseCase.test.ts`, `ajustes.test.ts`). | Pruebas | ✅ |

### HU-CON-05 — Diego

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-45 | `ReporteIngresosQuery` (puerto `ReporteIngresosRepository`): suma ventas, comisiones y netos del rango, descuenta los ajustes y entrega el bloque de control (ventas = comisiones + netos). La reutilizará la HU-CON-08. | Aplicación | ✅ |
| T-46 | `PgReporteIngresosRepository` con la consulta SQL por rango de fechas. | Infra | ✅ |
| T-47 | `GET /reportes/ingresos?desde=&hasta=&vendedorId=`. DTOs en `packages/contracts/src/reportes.ts`. | API | ✅ |
| T-48 | Pantalla de reporte con selector de rango, totales y detalle (`ReporteIngresosPage`). | Web | ✅ |
| T-49 | Pruebas: rango con ventas conocidas → totales exactos; rango vacío → ceros sin error; incluye los ajustes del rango (`ReporteIngresosQuery.test.ts`, `reportes.test.ts`). | Pruebas | ✅ |

### Compartidas

| ID | Tarea | Responsable | Estado |
|----|-------|-------------|--------|
| T-50 | Integrar HU-05 y HU-06 en `dev` (PR #11) y ajustar las tablas de Ajustes para que quepan sin desplazamiento horizontal. | Carlos | ✅ |
| T-51 | Demo con datos de ejemplo y validación del Contador de los criterios del F01 de 04, 05 y 06; confirmación de D-07 y D-08. | Carlos + Diego | ✅ 2026-11-06 |

## Cierre (2026-11-06)

**Entregables**

- Conciliación operativa con mock y CSV de Pagos: PR #10.
- Ajustes con reverso de comisión y neto: PR #8.
- Reporte de ingresos y comisiones por periodo: PR #9.
- Integración de 05 y 06 en `dev`: PR #11.
- CI en verde en `dev`.

**Criterio de salida:** criterios del F01 de las HU 04, 05 y 06 validados por el Contador
el 2026-11-06. D-07 (reglas de ajustes) y D-08 (tolerancia 0) pasan a CONFIRMADA
(ver [`decisiones.md`](../fase0/decisiones.md)).

**Velocidad:** 18 / 18 pts (Sprint 1: 18 / 18).

**Queda abierto**

- Pregunta al equipo de Pagos: ¿el valor de `pago.recibido` viene neto de los costos de la
  pasarela? ¿Envían los costos por separado? (ver
  [`contratos-integracion.md`](../fase0/contratos-integracion.md)). Mientras tanto, la
  diferencia se ve como PENDIENTE en la conciliación.
- `HttpPaymentsGateway`: se implementa cuando Pagos publique su API (Fase 6).

**Pasa al Sprint 3 (2026-11-09 a 2026-11-20)**

- HU-CON-10 (pago al vendedor). Usa el saldo a favor que generan los ajustes y deja las cuentas
  en PAGADA o PARCIAL.
- HU-CON-07, HU-CON-08 (reutiliza `ReporteIngresosQuery`) y HU-CON-11.
- Antes de empezar se validan D-06 (FIFO por periodo) y D-09 (columnas del Excel), y se
  asignan los responsables.
