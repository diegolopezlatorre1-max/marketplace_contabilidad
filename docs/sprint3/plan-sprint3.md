# Sprint 3 — Consulta, exportación y control

**Fechas:** 2026-11-09 a 2026-11-20 (2 semanas) · **Carga:** 12 pts · **Equipo:** Carlos, Diego

**Objetivo:** cerrar el ciclo de las cuentas por pagar con el pago al vendedor, consultar el
estado financiero por vendedor, exportar la información contable a Excel y consultar la
auditoría de movimientos.

Planeación en Excel: [`Planeacion_Sprint3_Contabilidad.xlsx`](Planeacion_Sprint3_Contabilidad.xlsx).

## Antes de empezar (día 1)

- [x] **D-06** (confirmada 2026-11-06): validar con el Contador que el pago se aplica FIFO por periodo y que primero se
      descuenta el saldo a favor del marketplace. Bloquea la HU-CON-10.
- [x] **D-09** (confirmada 2026-11-06): validar con el Administrador financiero las columnas del Excel. Bloquea la
      HU-CON-08.
- [x] Acordar las interfaces del día 1 (ver "Acuerdos").

## Reparto

| HU | Pts | Responsable | Por qué |
|----|-----|-------------|---------|
| HU-CON-10 Registrar pago a vendedor | 3 | **Carlos** | Va primero: la HU-07 necesita el valor pagado. |
| HU-CON-07 Estado financiero por vendedor | 3 | **Carlos** | Continúa la HU-10 (pagado y pendiente). |
| HU-CON-08 Exportar a Excel | 3 | **Diego** | Reutiliza `ReporteIngresosQuery`, que Diego hizo en la HU-05. |
| HU-CON-11 Consultar auditoría | 3 | **Diego** | Independiente: la tabla `contabilidad.auditoria` existe desde la Fase 1. |
| **Total** | **12** | Carlos 6 · Diego 6 | |

## Tareas

Estado: ⬜ pendiente · 🔄 en progreso · ✅ hecha

### HU-CON-10 — Carlos

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-52 | `PagoVendedor` (fecha, valor, referencia, soporte) y su aplicación FIFO por periodo a las cuentas pendientes, descontando primero el saldo a favor del marketplace; rechaza pagar más del saldo. Pruebas unitarias. | Dominio | ✅ |
| T-53 | Estado PARCIAL en `CuentaPorPagar`; se mantiene `PAGADO` como nombre único del estado pagado en dominio, API y web. | Dominio | ✅ |
| T-54 | Migración `007_pago_vendedor.sql` (`pago_vendedor`, `pago_vendedor_detalle` con la cuenta aplicada y el valor) y `PgPagoVendedorRepository`. | BD / Infra | ✅ |
| T-55 | `RegistrarPagoVendedorUseCase` (CONTADOR) en una `UnitOfWork`, con auditoría y outbox; `ListarPagosVendedorQuery`. Lee el saldo a favor de `ajuste_contable`. | Aplicación | ✅ |
| T-56 | `POST /pagos-vendedor` y `GET /pagos-vendedor?vendedorId=&desde=&hasta=`. DTOs en `packages/contracts/src/pagosVendedor.ts`, OpenAPI y Postman. | API | ✅ |
| T-57 | Pantalla "Pagos a vendedores" (`PagosVendedorPage`): registrar pago e historial; estado Parcial en Cuentas por pagar. | Web | ✅ |
| T-58 | Pruebas: pago de 90.000 deja la cuenta PAGADA y el saldo en 45.000; pago parcial → PARCIAL; pago mayor al saldo rechazado; saldo a favor descontado; pagos simultáneos no superan el saldo. | Pruebas | ✅ |

### HU-CON-07 — Carlos

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-59 | `EstadoVendedorQuery`: total vendido, comisión, ajustes, pagado y pendiente por quincena (la de la venta, que es la de su cuenta); regla de control vendido − comisión − ajustes (neto) = pagado + pendiente. | Aplicación | ✅ |
| T-60 | `GET /vendedores/{id}/estado?desde=&hasta=`. DTOs en `packages/contracts/src/estadoVendedor.ts` y OpenAPI. | API | ✅ |
| T-61 | Permiso VENDEDOR preparado en `application/security.ts` (solo su propio estado), sin exponerlo todavía. | Aplicación | ✅ |
| T-62 | Ficha del vendedor con totales y movimientos del periodo. | Web | ✅ |
| T-63 | Pruebas: vendedor con movimientos en dos meses, al filtrar un mes solo aparece ese mes; la regla de control cuadra al centavo. | Pruebas | ✅ |

### HU-CON-08 — Diego

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-64 | Puerto `SpreadsheetExporter` y `ExportarExcelUseCase`, que reutiliza `ReporteIngresosQuery` para que los números coincidan con la pantalla. | Aplicación | ✅ |
| T-65 | `ExcelJsExporter` (`exceljs` 4.4.0 en `apps/api`): celdas numéricas con formato moneda, encabezados, fila de totales con fórmula SUM y hojas Ventas (columnas de D-09), Ajustes, Resumen y Metadatos (rango, fecha de generación, usuario). | Infra | ✅ |
| T-66 | `GET /exportaciones/excel?desde=&hasta=` (ADMIN_FINANCIERO, CONTADOR), que responde con el tipo `.xlsx`; OpenAPI. | API | ✅ |
| T-67 | Botón "Exportar a Excel" en el reporte de ingresos. | Web | ✅ |
| T-68 | Prueba automática que lee el `.xlsx`: la suma de "valor bruto" es igual al total del reporte; los valores son números, no texto; rango vacío → archivo con encabezados y totales en cero. | Pruebas | ✅ |

### HU-CON-11 — Diego

| ID | Tarea | Capa | Estado |
|----|-------|------|--------|
| T-69 | `ConsultarAuditoriaQuery` con filtros por entidad, usuario y fechas, paginada, sobre `contabilidad.auditoria` (índices ya creados en `001_esquema_base.sql`). | Aplicación / Infra | ✅ |
| T-70 | `GET /auditoria?entidad=&usuario=&desde=&hasta=` (solo ADMIN_FINANCIERO). DTOs en `packages/contracts/src/auditoria.ts` y OpenAPI. | API | ✅ |
| T-71 | Pantalla de auditoría con los valores antes y después (`valores_anteriores` / `valores_nuevos`). | Web | ✅ |
| T-72 | Pruebas: los filtros devuelven solo lo esperado; otro rol → 403; los comandos nuevos del sprint (pago al vendedor) aparecen en la auditoría. | Pruebas | ✅ |

### Compartidas

| ID | Tarea | Responsable | Estado |
|----|-------|-------------|--------|
| T-73 | Prueba de cuadre global: ventas = comisiones + netos; neto − ajustes = pagado + pendiente por vendedor; el Excel coincide con el reporte. | Carlos + Diego | ✅ |
| T-74 | Revisión cruzada: cada PR lo aprueba el otro integrante. | Carlos + Diego | ✅ |
| T-75 | Demo con datos de ejemplo y validación del Contador y del Administrador financiero (criterios del F01 de 07, 08, 10 y 11). | Carlos (presenta) + Diego | ✅ 2026-11-06 |

## Calendario sugerido

| Días | Carlos | Diego |
|------|--------|-------|
| Lun 9 | Validar D-06 · interfaces del día 1 | Validar D-09 · interfaces del día 1 |
| Mar 10 – Vie 13 | HU-10: T-52 a T-56 | HU-11 completa (T-69 a T-72); T-64 |
| Lun 16 – Mar 17 | T-57, T-58; HU-07: T-59, T-60 | HU-08: T-65, T-66 |
| Mié 18 – Jue 19 | T-61 a T-63; T-73 | T-67, T-68; T-73 |
| Vie 20 | T-75 demo y cierre | T-75 demo y cierre |

## Acuerdos para trabajar en paralelo

- **Migraciones:** Carlos usa la `007` (`pago_vendedor`). Diego no necesita migraciones; si
  aparece alguna, usa la `008`.
- **Interfaces del día 1,** en `apps/api/src/application/ports/out/`:
  - `PagoVendedorRepository` y el cálculo de lo pagado por cuenta (Carlos), que la HU-07 usa
    para el pendiente.
  - `SpreadsheetExporter.exportar(filas, metadatos)` → stream del `.xlsx` (Diego).
  - `AuditoriaRepository.buscar(filtros, paginacion)` (Diego).
- **Ramas:** una rama por HU desde `dev` (`feat/hu-con-10-pago-vendedor`,
  `feat/hu-con-07-estado-vendedor`, `feat/hu-con-08-exportar-excel`,
  `feat/hu-con-11-auditoria`); PR a `dev` con la plantilla del DoD.
- **Contracts:** cada uno agrega sus DTOs en un archivo propio de `packages/contracts/src/`.

## Cierre (2026-11-06)

El desarrollo terminó el 2026-11-06, antes de las fechas previstas (2026-11-09 a 2026-11-20).

**Entregables**

| HU | Resultado | PR |
|----|-----------|----|
| HU-CON-10 Pago a vendedor | Pago con fecha, valor, referencia y soporte; descuenta el saldo a favor y se aplica FIFO por periodo; estado PARCIAL; pantalla "Pagos a vendedores". | #14 |
| HU-CON-07 Estado por vendedor | Vendido, comisión, ajustes, pagado y pendiente por quincena con la regla de control; rol VENDEDOR preparado; pantalla "Estado por vendedor". | #15 |
| HU-CON-11 Auditoría | `GET /auditoria` por entidad, usuario y día (hora de Colombia), solo ADMIN_FINANCIERO; pantalla con los valores antes y después. | #16 |
| HU-CON-08 Exportar a Excel | `.xlsx` con las columnas de D-09 y los mismos totales del reporte; botón en el reporte de ingresos. | #17 |

Documentación del sprint: PR #13 (plan y Excel) y #18 (avance en el Excel).

**Criterio de salida:** criterios del F01 de 07, 08, 10 y 11 validados por el Contador y el
Administrador financiero el 2026-11-06; D-06 y D-09 pasan a CONFIRMADA (ver
[`decisiones.md`](../fase0/decisiones.md)). Prueba de cuadre global (T-73): el reporte cuadra
bruto = comisión + neto, el estado por vendedor cuadra vendido − comisión − ajustes = pagado +
pendiente, y el Excel coincide con el reporte.

**Velocidad:** 12 / 12 pts (Sprint 1: 18 / 18 · Sprint 2: 18 / 18).

**Calidad al cierre (rama `dev`):** pruebas unitarias 227 (API), 65 (web) y 6 (contracts);
71 de integración con PostgreSQL; colección de Postman 70 peticiones / 142 aserciones sin
fallas; CI en verde.

**Queda abierto**

- Pregunta al equipo de Pagos: ¿el valor de `pago.recibido` viene neto de los costos de la
  pasarela?
- Exponer el rol VENDEDOR cuando el marketplace lo requiera (la consulta ya lo soporta).

**Pasa al Sprint 4 (Fase 5, endurecimiento, 2026-11-23 a 2026-12-04):** el plan de la Fase 5 en
[`Plan_Desarrollo_Modulo_Contabilidad.txt`](../Plan_Desarrollo_Modulo_Contabilidad.txt) y las
mejoras del cierre: pruebas de extremo a extremo de la interfaz y fusionar cada PR apenas pasa
la revisión.
