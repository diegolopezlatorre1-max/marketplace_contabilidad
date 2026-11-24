# Prueba F08 · Módulo de Contabilidad

Pruebas de las 11 historias de usuario del módulo (HU-CON-01 a HU-CON-11, `docs/requerimientos-modulo-contabilidad.txt`). Cada historia tiene un caso positivo y un caso negativo ejecutados contra la API del [Contrato API v1](contrato-api-v1.md), con el resultado real obtenido.

## 1. Entorno y método

| Elemento | Valor |
|---|---|
| Ejecución | 2026-11-24, Vitest 5.0.3, Node 22 |
| Servidor | Router Express del módulo en modo mock (`AUTH_MODE=mock`), base en memoria |
| Fecha del sistema | 2026-10-05 (reloj fijo de las pruebas) |
| Comisión inicial | Global del 10 % vigente desde 2026-01-01 |
| Tokens | `mock-admin` (ADMIN), `mock-vendedor` (vendedor V-1), `mock-sistema` (módulos Órdenes y Pagos) |
| Base URL | `/api/contabilidad` |

Los casos se ejecutan en secuencia sobre el mismo servidor, así que cada uno parte de los datos que dejaron los anteriores. Datos base: la orden `ORD-1001` del 2026-10-05 con dos líneas, V-1 por 100.000,00 y V-2 por 50.000,00 COP.

## 2. Resumen

| HU | Funcionalidad | Positivo | Negativo |
|---|---|---|---|
| 01 | Registrar venta confirmada | 201 `PROCESADO` ✓ | 200 `YA_PROCESADO`, sin duplicar ✓ |
| 02 | Calcular comisión | 200, comisión 10 % ✓ | 400 monto negativo ✓ |
| 03 | Cuentas por pagar a vendedores | 200, saldo pendiente ✓ | 400 periodo inválido ✓ |
| 04 | Conciliar pagos recibidos | 201 `CONCILIADA` ✓ | 404 `ORDEN_INEXISTENTE` ✓ |
| 05 | Reporte de ingresos | 200, totales cuadran ✓ | 400 rango invertido ✓ |
| 06 | Ajustes por devolución | 201, revierte comisión ✓ | 422 `AJUSTE_EXCEDE_SALDO` ✓ |
| 07 | Estado financiero del vendedor | 200, control cuadra ✓ | 403 vendedor ajeno ✓ |
| 08 | Exportar a Excel | 200 `.xlsx`, valores iguales al reporte ✓ | 400 rango invertido ✓ |
| 09 | Configurar comisión con vigencia | 200, nueva vigencia ✓ | 403 rol sin permiso ✓ |
| 10 | Pago a vendedor | 201, cuenta `PARCIAL` ✓ | 422 `PAGO_EXCEDE_SALDO` ✓ |
| 11 | Auditoría de movimientos | 200, antes y después ✓ | 403 rol sin permiso ✓ |

**22 de 22 casos aprobados.**

## 3. Casos por historia

### HU-CON-01 · Registrar automáticamente una venta confirmada

| | Positivo · CP-01 | Negativo · CN-01 |
|---|---|---|
| Petición | `POST /eventos/orden-confirmada` con `mock-sistema`, `eventId: evt-001`, `ORD-1001`, dos líneas | El mismo evento `evt-001` reenviado |
| Esperado | Registra una venta por vendedor | No duplica la orden |
| Obtenido | `201 { "resultado": "PROCESADO" }`; `GET /ventas` muestra 2 registros (V-1 y V-2) | `200 { "resultado": "YA_PROCESADO" }`; siguen 2 registros |
| Estado | Aprobado | Aprobado |

Variante: una orden en estado `CREADA` responde `200 IGNORADO` con el detalle "solo se registran órdenes CONFIRMADA".

### HU-CON-02 · Calcular la comisión por cada venta

| | Positivo · CP-02 | Negativo · CN-02 |
|---|---|---|
| Petición | `GET /ventas` con `mock-admin` | Orden `ORD-1003` con `valorBruto: "-1000.00"` |
| Esperado | Bruto, comisión y neto con el % vigente | Rechaza el monto |
| Obtenido | `200`; V-1: bruto `100000.00`, `porcentajeAplicado 10.0000`, comisión `10000.00`, neto `90000.00` | `400 VALIDACION`: `lineas.0.valorBruto` "El monto debe ser mayor que cero" |
| Estado | Aprobado | Aprobado |

### HU-CON-03 · Registrar los valores pendientes de pago

| | Positivo · CP-03 | Negativo · CN-03 |
|---|---|---|
| Petición | `GET /cuentas-por-pagar?periodo=2026-10-Q1` | `GET /cuentas-por-pagar?periodo=2026-10-Q3` |
| Esperado | Saldo por vendedor y quincena | Rechaza el periodo |
| Obtenido | `200`; V-1 `saldoPendiente 90000.00`, V-2 `45000.00`, ambos `PENDIENTE` | `400 VALIDACION`: "Periodo inválido: use AAAA-MM-Q1 o AAAA-MM-Q2" |
| Estado | Aprobado | Aprobado |

### HU-CON-04 · Conciliar pagos recibidos contra las órdenes

| | Positivo · CP-04 | Negativo · CN-04 |
|---|---|---|
| Petición | Pago `PSE-1` por 150.000,00 (`201 SIN_CONCILIAR`), luego `POST /conciliaciones` con `ORD-1001` | Pago `PSE-2` y `POST /conciliaciones` con `ORD-9999` |
| Esperado | Concilia sin diferencia | Rechaza una orden que no existe |
| Obtenido | `201`; `valorAplicado 150000.00`, `diferencia 0.00`, `estado CONCILIADA` | `404 ORDEN_INEXISTENTE`: "No hay ventas registradas para la orden ORD-9999" |
| Estado | Aprobado | Aprobado |

### HU-CON-05 · Reporte de ingresos y comisiones por periodo

| | Positivo · CP-05 | Negativo · CN-05 |
|---|---|---|
| Petición | `GET /reportes/ingresos?desde=2026-10-01&hasta=2026-10-31` | `?desde=2026-10-31&hasta=2026-10-01` |
| Esperado | Totales iguales a las transacciones | Rechaza el rango |
| Obtenido | `200`; ventas 150.000 / 15.000 / 135.000, ajustes 30.000 / 3.000 / 27.000, total 120.000 / 12.000 / 108.000, `control.cuadra: true` | `400 VALIDACION`: "La fecha \"desde\" no puede ser posterior a \"hasta\"" |
| Estado | Aprobado | Aprobado |

### HU-CON-06 · Registrar ajustes por devoluciones o cancelaciones

| | Positivo · CP-06 | Negativo · CN-06 |
|---|---|---|
| Petición | `POST /ajustes` `DEVOLUCION` de 30.000,00 sobre la venta de V-1 | Otra `DEVOLUCION` de 70.000,01 sobre la misma venta |
| Esperado | Revierte comisión y neto con el % original | No deja devolver más de lo vendido |
| Obtenido | `201`; `comisionRevertida 3000.00`, `netoRevertido 27000.00`; saldo de V-1 baja de 90.000 a 63.000 | `422 AJUSTE_EXCEDE_SALDO`: "supera lo que queda por ajustar (70000.00)" |
| Estado | Aprobado | Aprobado |

### HU-CON-07 · Consultar el estado financiero de los vendedores

| | Positivo · CP-07 | Negativo · CN-07 |
|---|---|---|
| Petición | `GET /vendedores/V-1/estado?desde=2026-10-Q1&hasta=2026-10-Q2` con `mock-admin` | `GET /vendedores/V-2/estado` con `mock-vendedor` (V-1) |
| Esperado | Vendido, comisión, pagado y pendiente | Un vendedor no ve datos de otro |
| Obtenido | `200`; vendido `100000.00`, comisión `10000.00`, ajustes `27000.00`, pagado `0.00`, pendiente `63000.00`, `control.cuadra: true` | `403 NO_AUTORIZADO`: "Un vendedor solo puede consultar su propia información" |
| Estado | Aprobado | Aprobado |

### HU-CON-08 · Exportar información contable a Excel

| | Positivo · CP-08 | Negativo · CN-08 |
|---|---|---|
| Petición | `GET /exportaciones/excel?desde=2026-10-01&hasta=2026-10-31` | `?desde=2026-10-31&hasta=2026-10-01` |
| Esperado | Archivo `.xlsx` con los valores del sistema | Rechaza el rango, sin archivo |
| Obtenido | `200`, `contabilidad_2026-10-01_2026-10-31.xlsx`; hoja Resumen: ventas 150.000 / 15.000 / 135.000, ajustes 30.000 / 3.000 / 27.000, total 120.000 / 12.000 / 108.000, igual a CP-05 | `400 VALIDACION`: "La fecha \"desde\" no puede ser posterior a \"hasta\"" |
| Estado | Aprobado | Aprobado |

### HU-CON-09 · Configurar el porcentaje de comisión con vigencia

| | Positivo · CP-09 | Negativo · CN-09 |
|---|---|---|
| Petición | `PUT /comisiones/configuracion` `{ "porcentaje": "12", "vigenteDesde": "2026-11-01" }` con `mock-admin` | El mismo `PUT` con `mock-vendedor` |
| Esperado | Nueva vigencia sin solaparse | Solo el ADMIN cambia el % |
| Obtenido | `200`; 12 % desde 2026-11-01 y el 10 % queda cerrado el 2026-10-31 | `403 NO_AUTORIZADO` |
| Estado | Aprobado | Aprobado |

Variante: una vigencia desde 2025-12-31 responde `409 CONFLICTO`: "La nueva vigencia debe empezar después del 2026-11-01". Las ventas de CP-02 conservan el 10 %.

### HU-CON-10 · Registrar el pago realizado a un vendedor

| | Positivo · CP-10 | Negativo · CN-10 |
|---|---|---|
| Petición | Órdenes marca la entrega de `ORD-1001` (escrow `LIBERADO`); `POST /pagos-vendedor` V-1 por 40.000,00, `TRF-1` | `POST /pagos-vendedor` V-1 por 23.000,01, `TRF-2` |
| Esperado | Aplica a la cuenta más antigua | No paga más de lo que se debe |
| Obtenido | `201`; periodo `2026-10-Q1`, saldo 63.000 → 23.000, estado `PARCIAL` | `422 PAGO_EXCEDE_SALDO`: "supera lo que se le debe al vendedor V-1: 23000.00" |
| Estado | Aprobado | Aprobado |

### HU-CON-11 · Consultar la auditoría de movimientos

| | Positivo · CP-11 | Negativo · CN-11 |
|---|---|---|
| Petición | `GET /auditoria?entidad=ajuste_contable` con `mock-admin` | `GET /auditoria` con `mock-vendedor` |
| Esperado | Valores antes y después del cambio | Solo el ADMIN accede |
| Obtenido | `200`; ajuste de CP-06 con `usuario u-admin`, antes `saldoPendiente 90000.00` y después el ajuste registrado | `403 NO_AUTORIZADO` |
| Estado | Aprobado | Aprobado |

## 4. Pruebas automatizadas

Además de los 22 casos, se ejecutó toda la suite unitaria del repositorio:

```bash
cd apps/api
npm test
```

| HU | Archivos de prueba | Pruebas | Resultado |
|---|---|---|---|
| 01 | `RegistrarVentaConfirmadaUseCase`, `VentaContable`, `MockOrdersGateway`, rutas de ventas | 30 | ✓ |
| 02 | `ComisionVenta`, `Porcentaje`, `Money` | 17 | ✓ |
| 03 | `cuentaPorPagar`, `Periodo`, `FechaContable`, `ConsultasCuentasYVentas` | 27 | ✓ |
| 04 | `ConciliacionUseCases`, `Conciliacion`, `Pagos` (CSV), rutas de conciliación | 30 | ✓ |
| 05 | `ReporteIngresosQuery`, ruta del reporte | 8 | ✓ |
| 06 | `AjustesUseCase`, `AjusteContable`, rutas de ajustes | 25 | ✓ |
| 07 | `EstadoVendedorQuery`, ruta del estado | 10 | ✓ |
| 08 | `ExportarExcelUseCase`, ruta de exportación | 6 | ✓ |
| 09 | `ConfigurarComisionUseCase`, `ConfiguracionComision`, rutas de comisión | 27 | ✓ |
| 10 | `PagoVendedorUseCase`, `PagoVendedor`, rutas de pagos a vendedores | 27 | ✓ |
| 11 | `ConsultarAuditoriaQuery`, ruta de auditoría | 4 | ✓ |
| — | Transversales: escrow, autenticación, health, configuración, outbox | 84 | ✓ |

**Resultado: 35 archivos, 295 pruebas aprobadas, 0 fallidas.** Las pruebas de integración (`npm run test:integration`) necesitan PostgreSQL y no se ejecutaron en esta corrida.

## 5. Conclusión

Las 11 historias cumplen sus criterios de aceptación en el caso positivo, y en el caso negativo el sistema rechaza la operación con el código y el error esperados, sin alterar los datos.
