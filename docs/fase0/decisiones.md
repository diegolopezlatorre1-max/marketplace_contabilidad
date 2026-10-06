# Fase 0 — Decisiones de negocio

Estado de las decisiones que el Formato 01 dejó abiertas (hallazgos H-01 a H-16).
Las marcadas **PROVISIONAL** se tomaron por defecto para no bloquear el desarrollo;
deben validarse con el contador y los equipos antes del sprint indicado.
Cambiar una decisión provisional tiene un impacto acotado: está aislada en el punto
del código que se indica.

| ID | Decisión | Valor adoptado | Estado | Validar con | Antes de | Dónde vive en el código |
|----|----------|----------------|--------|-------------|----------|-------------------------|
| D-01 | Moneda | COP única | PROVISIONAL | Contador | Sprint 1 | `domain/shared/Money.ts` (`MONEDA`) |
| D-02 | Redondeo | HALF_UP, 2 decimales; el neto se calcula por resta (bruto − comisión) para garantizar bruto = comisión + neto | PROVISIONAL | Contador | Sprint 1 | `domain/shared/decimal.ts`, `Money.percentage()` |
| D-03 | Periodo de liquidación (H-05) | Quincenal: Q1 = días 1–15, Q2 = 16–fin de mes, en hora de Colombia | PROVISIONAL | Contador | Sprint 1 | `domain/shared/Periodo.ts` |
| D-04 | Alcance del % de comisión (H-03) | Global con vigencias; modelo preparado para VENDEDOR y CATEGORIA (prioridad vendedor > categoría > global). Lo configura el rol ADMIN_FINANCIERO (HU-CON-09) | PROVISIONAL | Contador / Administración | Sprint 1 | Sprint 1: `ConfiguracionComision` |
| D-05 | Órdenes multi-vendedor (H-12) | Un registro contable por (orden, vendedor) | PROVISIONAL | Equipo Órdenes | Sprint 1 | Contrato `orden.confirmada.lineas[]` |
| D-06 | Pago al vendedor (H-04) | Nueva HU-CON-10; el pago se aplica FIFO por periodo a las cuentas pendientes | PROVISIONAL | Contador | Sprint 3 | Sprint 3 |
| D-07 | Ajustes (H-06) | Reverso proporcional de comisión y neto con el % aplicado originalmente; devoluciones parciales permitidas hasta el valor no ajustado; si la cuenta ya está pagada se genera saldo a favor del marketplace que se descuenta en la siguiente liquidación | PROVISIONAL | Contador | Sprint 2 | Sprint 2: `PoliticaAjuste` |
| D-08 | Tolerancia de conciliación | 0 (exacta) hasta que el contador defina otra; configurable | PROVISIONAL | Contador / Pagos | Sprint 2 | Sprint 2: `PoliticaConciliacion` |
| D-09 | Columnas del Excel (H-07) | fecha, número de orden, vendedor, valor bruto, % comisión, comisión, valor neto, estado de pago, estado de conciliación, ajustes | PROVISIONAL | Admin. financiero | Sprint 3 | Sprint 3 |
| D-10 | Impuestos y facturación (H-09, H-10) | Won't Have: facturación electrónica DIAN, IVA/retenciones, nómina, contabilidad general | PROVISIONAL | Contador | Fase 5 | — |
| D-11 | Partida doble / PUC | Fuera del alcance de los sprints 1–3; opcional en la Fase 5 | PROVISIONAL | Contador | Fase 5 | — |
| D-12 | Roles (H-11) | CONTADOR, ADMIN_FINANCIERO, SISTEMA (módulos) | ADOPTADA | Administración | Sprint 1 | `application/security.ts` |
| D-13 | Auditoría (H-11) | Todo comando registra en `contabilidad.auditoria`; consulta en HU-CON-11 | ADOPTADA | — | — | `PgAuditLogger` |
| D-14 | Sprints (H-08, H-13, H-14, H-15) | 2 semanas; carga 18 / 18 / 12 pts; HU-CON-04 dividida en 04a/04b; objetivo Sprint 2: "Conciliación, ajustes y reporte de ingresos" | ADOPTADA | Equipo | Sprint 1 | Plan de desarrollo |

## Pendiente de diligenciar en el F01 (H-01, H-02, H-08)

- [ ] Nombre del equipo e integrantes; rotular la celda "Versión".
- [ ] Responsable con nombre por historia.
- [ ] Fechas de inicio y fin de cada sprint.
- [ ] Agregar HU-CON-09, HU-CON-10 y HU-CON-11 al backlog.
- [ ] Usar la columna "Observaciones" para dependencias y supuestos.
