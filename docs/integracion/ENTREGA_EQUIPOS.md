# Entrega a los equipos · Módulo de Contabilidad (Equipo 6)

Paquete de integración que pide `GUIA_EQUIPO_6.md` (sección 9). El contrato completo está en
[`docs/contrato-api-v1.md`](../contrato-api-v1.md).

## 1. URL del servicio

| Elemento | Valor |
|---|---|
| API Base URL | `https://marketplace-contabilidad-api.onrender.com/api` |
| Rutas del módulo | `https://marketplace-contabilidad-api.onrender.com/api/contabilidad` |
| Swagger | `https://marketplace-contabilidad-api.onrender.com/docs` |
| OpenAPI (JSON) | `https://marketplace-contabilidad-api.onrender.com/openapi.json` |
| Estado | `https://marketplace-contabilidad-api.onrender.com/health` |
| Verificado el | 2026-11-27 (`/health` → 200 con BD ok, Swagger publicado, `x-api-key` de Órdenes y Pagos aceptadas) |

El servicio está en el plan gratuito de Render: tras 15 min sin tráfico se suspende y la primera
petición puede tardar cerca de 1 minuto.

## 2. Autenticación

| Quién | Cómo |
|---|---|
| Usuarios (Admin, Vendedor, Comprador) | `Authorization: Bearer <access_token>` del proyecto Supabase central. El rol se lee de `app_metadata.role`. |
| Módulos (Órdenes, Pagos) | `x-api-key: <clave del módulo>`. Cada equipo recibe su clave por un canal privado. |

Sin credenciales válidas → `401`. Rol o módulo sin permiso → `403`.

## 3. Por equipo

### Órdenes

| Qué envía | Ruta |
|---|---|
| Orden confirmada | `POST /api/contabilidad/eventos/orden-confirmada` |
| Orden cancelada | `POST /api/contabilidad/eventos/orden-cancelada` |
| Orden devuelta (total o parcial) | `POST /api/contabilidad/eventos/orden-devuelta` |
| Entrega del pedido (inicia la retención de 72 h) | `POST /api/contabilidad/escrow/marcar-entrega/{pedido_id}` |
| Bloqueo del pago de un pedido ante una PQR (cuerpo opcional `{ "motivo" }`) | `POST /api/contabilidad/escrow/bloquear/{pedido_id}` |

- Una línea por vendedor; montos como texto con 2 decimales (`"150000.00"`); fechas ISO 8601 con
  zona; moneda `COP`.
- El `eventId` no debe cambiar entre reintentos. Reintentar ante `5xx` o timeout; no ante `400`.
- Supuestos por confirmar: S-01 (`valorBruto` sin envío ni impuestos), S-02 (estado
  `CONFIRMADA`) y S-03 (`eventId` estable).

### Pagos

| Qué envía | Ruta |
|---|---|
| Pago recibido | `POST /api/contabilidad/eventos/pago-recibido` |
| Alternativa: archivo CSV (`referencia,fecha,valor,ordenes`) | lo carga el Admin en `POST /api/contabilidad/pagos-recibidos/importar` |

- `referenciaPasarela` única; en `ordenes`, el mismo número de orden que envía Órdenes.
- Por confirmar: si `valor` llega neto o bruto de los costos de la pasarela.

### Notificaciones (Equipo 3)

Contabilidad les envía `contabilidad.pago-vendedor.registrado` (v2) al acreditar un pago a un
vendedor (HU-NOT-05): vendedor, monto, referencia y órdenes asociadas. Formato y cabeceras en
`contrato-api-v1.md`, sección 3.5. Deben deduplicar por `eventId`.

Necesitamos su URL de recepción (y su clave, si la exigen) para activarlo. Es un pendiente no
bloqueante: mientras tanto los eventos se guardan en el outbox y se entregan cuando se configure
la URL.

## 4. Respuestas

| HTTP | Significado |
|---|---|
| `201` | Evento procesado por primera vez o recurso creado |
| `200` | Consulta correcta, evento repetido (`YA_PROCESADO`) o ignorado (`IGNORADO`) |
| `400` | Datos inválidos (no reintentar) |
| `401` / `403` | Sin credenciales válidas / sin permiso |
| `404` / `409` / `422` | Recurso inexistente / duplicado / regla contable incumplida |
| `429` | Límite de peticiones superado |
| `5xx` | Error del servicio (reintentar con el mismo `eventId`) |

Los errores usan `application/problem+json` con `code` y `correlationId`.

## 5. Estado del outbox (eventos que publica Contabilidad)

| Evento | Destino | Estado |
|---|---|---|
| `contabilidad.pago-vendedor.registrado` | Notificaciones | Pendiente de URL de Notificaciones (los eventos quedan en el outbox) |
| Demás eventos (`venta.registrada`, `ajuste.registrado`, `conciliacion.cerrada`, `escrow.actualizado`) | Sin consumidor definido | Se guardan en el outbox; no se entregan |

## 6. Para probar

Colección Postman: `docs/postman/contabilidad.postman_collection.json` con el entorno
`docs/postman/render.postman_environment.json` (ver `docs/postman/README.md`).
