# Fase 0 — Contratos de integración (borrador v1)

Fuente de verdad ejecutable: `packages/contracts/src/events.ts` (esquemas Zod).
Este documento es la versión legible para acordar con los otros equipos.

## Reglas generales

- Transporte inicial: HTTP POST a `/api/v1/contabilidad/eventos/<tipo>` (webhook),
  con `Authorization: Bearer <token de servicio>` (rol SISTEMA).
  Con un broker de eventos, el payload es el mismo.
- `eventId` es único por evento. Reenviar el mismo evento es seguro: la respuesta es
  `YA_PROCESADO` y no se crean registros duplicados.
- Los montos son **strings decimales** con máximo 2 decimales (`"100000.00"`), nunca `number`.
- Fechas en ISO 8601 con zona horaria (`2026-10-05T09:58:00-05:00`).
- `version` permite evolucionar el contrato sin romper a los consumidores.
- Respuesta: `{ eventId, resultado: "PROCESADO" | "YA_PROCESADO" | "IGNORADO", detalle? }`.
  Errores en formato `application/problem+json`.

## Módulo de Órdenes → Contabilidad (Sprint 1 y 2)

### `orden.confirmada`
```json
{
  "eventId": "evt-001",
  "version": 1,
  "ocurridoEn": "2026-10-05T10:00:00-05:00",
  "tipo": "orden.confirmada",
  "numeroOrden": "ORD-1001",
  "fecha": "2026-10-05T09:58:00-05:00",
  "estado": "CONFIRMADA",
  "moneda": "COP",
  "lineas": [
    { "vendedorId": "V-1", "valorBruto": "100000.00", "categoriaId": "CAT-9" },
    { "vendedorId": "V-2", "valorBruto": "50000.00" }
  ]
}
```
- Una línea por vendedor (órdenes multi-vendedor, H-12).
- Si `estado` ≠ `CONFIRMADA`, Contabilidad responde `IGNORADO` y lo registra en
  `evento_ignorado`.

**Preguntas para el equipo de Órdenes:**
1. ¿`valorBruto` incluye envío e impuestos? ¿La comisión aplica sobre el total?
2. ¿Cuál es el estado exacto que emiten para “confirmada”?
3. ¿Pueden garantizar `eventId` único y estable entre reintentos?

### `orden.cancelada`
`{ eventId, version, ocurridoEn, tipo, numeroOrden, fecha, motivo, lineas: [{ vendedorId }] }`

### `orden.devuelta`
`{ eventId, version, ocurridoEn, tipo, numeroOrden, fecha, motivo, lineas: [{ vendedorId, valorDevuelto }] }`
- Admite devoluciones parciales (`valorDevuelto` < valor bruto de la línea).

## Módulo de Pagos → Contabilidad (Sprint 2)

### `pago.recibido`
```json
{
  "eventId": "evt-p1",
  "version": 1,
  "ocurridoEn": "2026-10-05T10:00:00Z",
  "tipo": "pago.recibido",
  "referenciaPasarela": "PSE-889",
  "fecha": "2026-10-05T10:00:00Z",
  "valor": "150000.00",
  "moneda": "COP",
  "origen": "API",
  "ordenes": ["ORD-1001"]
}
```
- `ordenes` es opcional: si no viene, el contador asocia las órdenes al conciliar.
- Alternativa: importación de archivo CSV con columnas
  `referencia,fecha,valor,ordenes` (órdenes separadas por `;`).

**Preguntas para el equipo de Pagos:** ¿el valor viene neto de costos de la pasarela?
¿Envían los costos por separado?

## Contabilidad → Módulo de Vendedores (Sprint 1)

`GET /vendedores/{id}` → `{ id, razonSocial, nit, datosPago: { banco, tipoCuenta, numeroCuenta } }`

## Contabilidad → Marketplace (eventos publicados, vía outbox)

| Evento | Cuándo |
|--------|--------|
| `contabilidad.venta.registrada` | Venta, comisión y cuenta por pagar creadas |
| `contabilidad.ajuste.registrado` | Ajuste por devolución o cancelación |
| `contabilidad.pago-vendedor.registrado` | Pago a vendedor registrado |
| `contabilidad.conciliacion.cerrada` | Conciliación marcada como conciliada |

## Autenticación (Administración)

- Usuarios: token JWT emitido por el marketplace; Contabilidad necesita el emisor,
  las claves públicas (JWKS) y el claim que trae los roles.
- Mapeo de roles: CONTADOR, ADMIN_FINANCIERO; módulos: SISTEMA.
