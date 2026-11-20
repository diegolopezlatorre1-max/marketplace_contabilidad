# Fase 0 — Contratos de integración (v1 congelada)

Fuente de verdad ejecutable: `packages/contracts/src/events.ts` (esquemas Zod).
Este documento es la versión legible para acordar con los otros equipos.

> **Estado: v1 congelada el 2026-10-08.** Los otros equipos aún no han respondido;
> Contabilidad desarrolla contra esta versión con adaptadores mock
> (`INTEGRATION_MODE=mock`). Las preguntas abiertas se reemplazaron por
> **supuestos** explícitos (S-xx). Si un equipo responde distinto, el cambio se publica
> como `version: 2` (o como ajuste del adaptador) sin romper la v1.

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

**Supuestos v1 (pendientes de confirmar con el equipo de Órdenes):**
- S-01: `valorBruto` es el valor de los productos del vendedor, **sin envío ni
  impuestos**; la comisión se calcula sobre ese valor.
- S-02: Órdenes envía el estado literal `CONFIRMADA`; cualquier otro valor se ignora.
- S-03: `eventId` es único y **estable entre reintentos**. Contabilidad además impide
  duplicados por `(numeroOrden, vendedorId)` como segunda barrera.

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

**Preguntas para el equipo de Pagos (se cierran antes del Sprint 2):** ¿el valor viene
neto de costos de la pasarela? ¿Envían los costos por separado?

## Contabilidad → Módulo de Vendedores (Sprint 1)

`GET /vendedores/{id}` → `{ id, razonSocial, nit, datosPago: { banco, tipoCuenta, numeroCuenta } }`

**Supuestos v1:**
- S-04: si el vendedor no existe, la API responde `404`. Contabilidad registra la venta
  igual, con el `vendedorId` del evento, y muestra el nombre como "desconocido".
- S-05: Contabilidad guarda en caché los datos del vendedor; los datos bancarios no se
  copian a sus tablas.

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

**Supuestos v1 (hasta la Fase 6 se usa `AUTH_MODE=mock`):**
- S-06: JWT firmado con RS256 y validado con el JWKS del marketplace (`iss` y `aud`
  configurables).
- S-07: los roles vienen en el claim `roles: string[]`; el usuario, en `sub`.
- S-08: los módulos del marketplace se autentican con un token de servicio que tiene
  el rol `SISTEMA`.
