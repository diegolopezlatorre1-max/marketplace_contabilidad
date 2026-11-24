# Adaptador consumidor · Módulo de Contabilidad

Cómo Contabilidad se conecta con los demás módulos del marketplace (Órdenes, Pagos, Vendedores y los que reciben sus eventos) y qué debe hacer un módulo para consumir esta API. Sigue el [Contrato API v1](contrato-api-v1.md); los ejemplos HTTP completos están en [JSON + HTTP](json-http.md).

## 1. Dónde está el adaptador

La API usa arquitectura hexagonal (`docs/adr/0001`). Los casos de uso solo conocen puertos (`apps/api/src/application/ports/out`); cada módulo externo se conecta con un adaptador en `apps/api/src/infrastructure/integration` o `infrastructure/messaging`. El adaptador se elige al arrancar en `bootstrap/container.ts`.

| Módulo | Dirección | Puerto / entrada | Adaptador actual | Estado |
|---|---|---|---|---|
| Órdenes | Órdenes → Contabilidad (push) | `POST /eventos/orden-confirmada` | `MockOrdersGateway` + `npm run simular:orden` | Simulado |
| Pagos | Pagos → Contabilidad (push) | `POST /eventos/pago-recibido`, `POST /pagos-recibidos/importar` (CSV) | `MockPaymentsGateway` + `npm run simular:pago`, `CsvPaymentsImporter` | Simulado; CSV real |
| Vendedores | Contabilidad → Vendedores (pull) | `SellersGateway.obtenerNombres(ids)` | `MockSellersGateway` (V-1 a V-5) | Simulado |
| Notificaciones y suscriptores | Contabilidad → módulo (push) | `EventPublisher` → tabla `outbox` | `PgOutboxPublisher` + `OutboxRelay` (HTTP POST) | Real; falta la URL de destino |

## 2. Modo de integración

`INTEGRATION_MODE` (en `apps/api/.env` y `render.yaml`) acepta `mock`, `http` y `events`. Hoy solo existe `mock`, tanto en local como en Render, porque los otros módulos no han publicado su API. Cambiar el valor no altera nada todavía: `container.ts` siempre instancia `MockSellersGateway`.

Los mocks generan datos que cumplen el contrato v1 (fechas `-05:00`, montos como string decimal, `moneda: "COP"`), así que el código de negocio no cambia cuando llegue el adaptador real.

## 3. Entrada: Órdenes y Pagos

Órdenes y Pagos no son consultados por Contabilidad: ellos envían sus eventos a la API.

- **Autenticación:** `x-api-key` con la clave de cada módulo (`SERVICE_API_KEYS="ordenes:...,pagos:..."`). En el mock, `Authorization: Bearer mock-sistema`.
- **Idempotencia:** se deduplica por `eventId` (tabla `inbox`, `docs/adr/0003`). Un reintento con el mismo `eventId` responde `200 { "resultado": "YA_PROCESADO" }`.
- **Escrow:** Órdenes llama a `POST /escrow/marcar-entrega/{pedidoId}` al entregar un pedido; `POST /escrow/bloquear/{pedidoId}` queda para el módulo que gestione las PQR.

Simular a los productores contra la API local o desplegada:

```bash
npm run simular:orden -- --vendedores V-1,V-2 --valores 100000,50000
npm run simular:pago
npm run simular:orden -- --url https://<servicio>.onrender.com --api-key <clave de ordenes>
```

## 4. Salida: Vendedores

Contabilidad necesita el nombre o razón social del vendedor para sus consultas (HU-CON-03). El puerto es:

```ts
interface SellersGateway {
  // Los ids desconocidos no aparecen en el mapa.
  obtenerNombres(vendedorIds: string[]): Promise<Map<string, string>>;
}
```

`MockSellersGateway` responde con un catálogo fijo (`V-1` Artesanías del Valle S.A.S. … `V-5` Librería El Faro). Si un id no aparece, la consulta muestra el id.

**Adaptador HTTP propuesto (pendiente de la API de Vendedores).** Para `INTEGRATION_MODE=http`, un `HttpSellersGateway` que cumpla el mismo puerto:

| Elemento | Propuesta |
|---|---|
| Configuración | `VENDEDORES_URL`, `VENDEDORES_API_KEY` |
| Petición | `GET {VENDEDORES_URL}/vendedores?ids=V-1,V-2` con `x-api-key` y `x-correlation-id` |
| Respuesta esperada | `200 [ { "id": "V-1", "nombre": "Artesanías del Valle S.A.S." } ]` |
| Tiempo máximo | 3 s |
| Si falla | Se registra en el log y se devuelve un mapa vacío; la consulta contable responde igual, con el id en lugar del nombre |

La ruta y los campos se ajustan a lo que publique el equipo de Vendedores.

## 5. Salida: eventos de Contabilidad

Contabilidad escribe sus eventos en `contabilidad.outbox` en la misma transacción del cambio, y `OutboxRelay` los entrega por HTTP POST.

| Tipo | Cuándo |
|---|---|
| `contabilidad.venta.registrada` | Se registró una venta confirmada |
| `contabilidad.ajuste.registrado` | Se aplicó un ajuste contable |
| `contabilidad.pago-vendedor.registrado` (v2) | Se pagó a un vendedor (lo usa Notificaciones, HU-NOT-05) |
| `contabilidad.conciliacion.cerrada` | Se cerró una conciliación |
| `contabilidad.escrow.actualizado` | Cambió el escrow de un pedido |

**Petición que recibe el suscriptor**

```http
POST <url del suscriptor>
Content-Type: application/json
x-event-id: 7f3c...
x-event-type: contabilidad.pago-vendedor.registrado
x-correlation-id: 4b1e...
x-api-key: <OUTBOX_API_KEY, si el destino la exige>

{ "eventId": "7f3c...", "tipo": "contabilidad.pago-vendedor.registrado",
  "modulo": "contabilidad", "ocurridoEn": "2026-11-20T20:30:00.000Z",
  "correlationId": "4b1e...", "payload": { "version": 2, "vendedorId": "V-1", ... } }
```

- **Destinos:** `OUTBOX_DESTINOS="tipo=https://...,*=https://..."`. Sin destino, el evento queda `PENDIENTE` y `GET /health` lo cuenta.
- **Respuesta:** cualquier `2xx` lo marca `PUBLICADO`. Otro código, error de red o más de 5 s se reintenta con espera creciente; tras 8 intentos pasa a `DEAD_LETTER`.
- **Entrega al menos una vez:** el suscriptor debe deduplicar por `eventId`.

## 6. Checklist para un módulo consumidor

1. Pedir su clave de servicio (`x-api-key`) o, si es un usuario, usar el token de Supabase.
2. Tomar la URL base `https://<servicio>.onrender.com/api/contabilidad` y verificar `GET /health`.
3. Enviar `x-correlation-id` para poder rastrear la petición en los logs.
4. Reintentar con el mismo `eventId`; nunca generar uno nuevo para el mismo hecho.
5. Si recibe eventos, entregar su URL para `OUTBOX_DESTINOS`, responder `2xx` rápido y deduplicar por `eventId`.
