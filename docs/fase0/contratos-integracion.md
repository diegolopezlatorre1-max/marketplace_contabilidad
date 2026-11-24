# Fase 0 — Contratos de integración (v1 congelada)

Fuente de verdad ejecutable: `packages/contracts/src/events.ts` (esquemas Zod).
Este documento es la versión legible para acordar con los otros equipos.

> **Estado: v1 congelada el 2026-10-08.** Los otros equipos aún no han respondido;
> Contabilidad desarrolla contra esta versión con adaptadores mock
> (`INTEGRATION_MODE=mock`). Las preguntas abiertas se reemplazaron por
> **supuestos** explícitos (S-xx). Si un equipo responde distinto, el cambio se publica
> como `version: 2` (o como ajuste del adaptador) sin romper la v1.

## Reglas generales

- Transporte inicial: HTTP POST a `/api/contabilidad/eventos/<tipo>` (webhook),
  con la cabecera `x-api-key: <clave de servicio>` (cada módulo tiene su clave en
  `SERVICE_API_KEYS`; se autentica como servicio, no como rol de usuario).
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

## Marketplace → Contabilidad: escrow (GUIA_EQUIPO_6)

Custodia del dinero de cada pedido entre la entrega y el pago al vendedor. `pedido_id` es el
`numeroOrden` del evento `orden.confirmada`. Todas las operaciones son idempotentes: repetirlas
responde `200` con `resultado: "SIN_CAMBIOS"`.

| Ruta | Quién | Cuerpo (opcional) | Efecto |
|------|-------|-------------------|--------|
| `POST /api/contabilidad/escrow/marcar-entrega/{pedido_id}` | **Órdenes** (servicio, `x-api-key`) | `{ "fechaEntrega": "<ISO 8601>" }` (por defecto, ahora) | Retención de 72 h desde la entrega; **se libera sola** al cumplirse, sin otra llamada |
| `POST /api/contabilidad/escrow/bloquear/{pedido_id}` | Módulo por definir (servicio, `x-api-key`) | `{ "motivo": "PQR-15" }` | Bloquea el pago mientras haya PQR |
| `POST /api/contabilidad/escrow/desbloquear/{pedido_id}` | ADMIN de Contabilidad | `{ "motivo": "..." }` (**obligatorio**) | Desbloqueo manual; vuelve a la retención original o queda liberado |
| `GET /api/contabilidad/escrow/{pedido_id}` | ADMIN | — | Consulta el estado |

Estados: `SIN_ENTREGA`, `RETENIDO` (menos de 72 h desde la entrega), `LIBERADO` y `BLOQUEADO`.

Efecto en HU-CON-10: **solo se paga el neto de pedidos `LIBERADO`** (entregados hace 72 h o más y
sin bloqueo). Un pedido sin entrega registrada (con o sin registro de escrow), `RETENIDO` o
`BLOQUEADO` no se puede usar en un pago a vendedor; si el pago cabe en la deuda pero no en lo
disponible responde `422 SALDO_RETENIDO_ESCROW`. **Mientras Órdenes no llame `marcar-entrega`, no
se le puede pagar ningún pedido al vendedor.**

Pendiente de confirmar: qué módulo llamará `bloquear`.

## Contabilidad → Módulo de Vendedores (Sprint 1)

`GET /vendedores/{id}` → `{ id, razonSocial, nit, datosPago: { banco, tipoCuenta, numeroCuenta } }`

**Supuestos v1:**
- S-04: si el vendedor no existe, la API responde `404`. Contabilidad registra la venta
  igual, con el `vendedorId` del evento, y muestra el nombre como "desconocido".
- S-05: Contabilidad guarda en caché los datos del vendedor; los datos bancarios no se
  copian a sus tablas.

## Contabilidad → Marketplace (eventos publicados, vía outbox)

Cada evento se guarda en el outbox en la misma transacción del cambio y el **relay** lo entrega por
`HTTP POST` a la URL configurada para su tipo (`OUTBOX_DESTINOS`). Entrega **al menos una vez**:
el consumidor debe deduplicar por `eventId` y responder `2xx`. Ante otro estado, un error de red o
un timeout se reintenta con espera exponencial (5 s, 10 s, 20 s... hasta 1 h); tras
`OUTBOX_MAX_INTENTOS` (8) fallos el evento pasa a `DEAD_LETTER` y se informa en `GET /health`.

Sobre (cuerpo JSON):

```json
{
  "eventId": "6f1c…",
  "tipo": "contabilidad.pago-vendedor.registrado",
  "modulo": "contabilidad",
  "ocurridoEn": "2026-11-10T15:00:00.000Z",
  "correlationId": "corr-123",
  "payload": { … }
}
```

Cabeceras: `x-event-id`, `x-event-type`, `x-correlation-id` (si existe) y `x-api-key` si se
configuró `OUTBOX_API_KEY`.

| Evento | Cuándo |
|--------|--------|
| `contabilidad.venta.registrada` | Venta, comisión y cuenta por pagar creadas |
| `contabilidad.ajuste.registrado` | Ajuste por devolución o cancelación |
| `contabilidad.pago-vendedor.registrado` | **Pago acreditado** al vendedor (HU-NOT-05, para Notificaciones) |
| `contabilidad.conciliacion.cerrada` | Conciliación marcada como conciliada |
| `contabilidad.escrow.actualizado` | Cambio de estado del escrow de un pedido (entrega, bloqueo, desbloqueo) |

### `contabilidad.pago-vendedor.registrado` v2 (pago acreditado, HU-NOT-05)

Identifica al vendedor, el monto y las órdenes asociadas. Como el pago se aplica por quincena (FIFO),
las órdenes asociadas son las de las quincenas que cubrió el pago, sin las que el escrow retenía en
ese momento.

```json
{
  "version": 2,
  "pagoId": "8a2e…",
  "vendedorId": "V-1",
  "fecha": "2026-11-10T15:00:00.000Z",
  "valor": "135000.00",
  "moneda": "COP",
  "saldoAFavorAplicado": "0.00",
  "referencia": "TRF-1",
  "ordenes": ["ORD-1", "ORD-2"],
  "cuentas": [
    { "periodo": "2026-10-Q1", "valorAplicado": "90000.00", "saldoAnterior": "90000.00",
      "saldoNuevo": "0.00", "estado": "PAGADO", "ordenes": ["ORD-1"] }
  ]
}
```

v2 agrega `version`, `moneda`, `ordenes` y `cuentas[].ordenes`; los campos de v1 no cambian.
Pendiente de confirmar con Notificaciones (Equipo 3): la URL que recibirá el evento, si exige
`x-api-key` y si esperan otro nombre de evento.

## Autenticación (Administración)

- Usuarios: access token de Supabase Auth (proyecto compartido), validado con `getClaims`.
  Rol en `app_metadata.role`; vendedor = UUID del usuario o `app_metadata.vendedor_id`
  (pendiente de confirmar con el administrador del proyecto Supabase).
- Roles de aplicación (GUIA_EQUIPO_6): ADMIN, COMPRADOR, VENDEDOR. Los módulos se autentican
  como servicio.

**Supuestos v1 (hasta la Fase 6 se usa `AUTH_MODE=mock`):**
- S-06: JWT firmado con RS256 y validado con el JWKS del marketplace (`iss` y `aud`
  configurables).
- S-07: los roles vienen en el claim `roles: string[]`; el usuario, en `sub`.
- S-08: los módulos del marketplace se autentican con un token de servicio que tiene
  el rol `SISTEMA`.
