# Contrato API v1 · Módulo de Contabilidad

Versión 1 de la API del módulo de Contabilidad del marketplace. Se basa en las rutas que existen hoy en `apps/api/src/infrastructure/http/routes` y en los esquemas de `packages/contracts`.

## 1. Generalidades

| Elemento | Valor |
|---|---|
| Base URL local | `http://localhost:3000/api/contabilidad` |
| Base URL desplegada | `https://marketplace-contabilidad-api.onrender.com/api/contabilidad` |
| Alias obsoleto | `/api/v1/contabilidad` (responde igual, con cabecera `Deprecation: true`) |
| Documentación viva | `GET /docs` (Swagger) y `GET /openapi.json` |
| Formato | `application/json` (errores: `application/problem+json`) |
| Moneda | Solo `COP` |

**Convenciones de datos**

- Montos: string decimal con máximo 2 decimales, por ejemplo `"150000.00"`.
- Instantes: ISO 8601 con zona, por ejemplo `"2026-11-20T15:30:00-05:00"`.
- Fechas contables: `AAAA-MM-DD` (hora de Colombia).
- Periodo (quincena): `AAAA-MM-Q1` (días 1 a 15) o `AAAA-MM-Q2` (16 a fin de mes).
- Paginación: `?page=1&size=50` (máximo 200). Respuesta `{ "items": [], "page": 1, "size": 50, "total": 0 }`.
- Cada respuesta trae la cabecera `x-correlation-id`.

## 2. Autenticación

| Consumidor | Cabecera | Uso |
|---|---|---|
| Módulos del marketplace (Órdenes, Pagos) | `x-api-key: <clave>` | Endpoints `/eventos/*` y escrow de servicio |
| Usuarios (ADMIN, VENDEDOR) | `Authorization: Bearer <token>` | Consultas y operaciones contables |

Sin credenciales válidas la respuesta es `401`. Con credenciales pero sin el rol requerido, `403`.

- **Usuarios:** el `<token>` es el access token del proyecto Supabase central
  (`https://xmrlazemifmepyahqsrz.supabase.co`). Contabilidad verifica la firma con su JWKS, la
  expiración, el emisor (`.../auth/v1`) y la audiencia `authenticated`. El rol se lee de
  `app_metadata.role` (`admin`, `vendedor` o `comprador`); el vendedor, de
  `app_metadata.vendedor_id` o, si no viene, del `sub` del usuario.
- **Módulos:** cada módulo recibe su propia clave de Contabilidad por un canal privado. No se
  comparte entre módulos ni se guarda en el código.

## 3. Endpoints

### 3.1 Sistema

| Método | Ruta | Acceso | Respuesta |
|---|---|---|---|
| GET | `/health` | Público | `200` ok, `503` degradado |
| GET | `/me` | Autenticado | `200` usuario actual |

```json
// GET /health → 200
{
  "status": "ok",
  "modulo": "contabilidad",
  "version": "0.1.0",
  "integrationMode": "mock",
  "checks": { "baseDeDatos": "ok" },
  "outbox": { "pendientes": 0, "deadLetter": 0 },
  "fecha": "2026-11-23T01:00:00.000Z"
}
```

### 3.2 Eventos entrantes (servicio, `x-api-key`)

Todos los eventos llevan `eventId` (clave de idempotencia), `version: 1`, `tipo` y `ocurridoEn`. Responden `201` la primera vez (`PROCESADO`) y `200` en un reintento (`YA_PROCESADO`) o si se ignora (`IGNORADO`).

| Método | Ruta | Emisor | `tipo` |
|---|---|---|---|
| POST | `/eventos/orden-confirmada` | Órdenes | `orden.confirmada` |
| POST | `/eventos/orden-cancelada` | Órdenes | `orden.cancelada` |
| POST | `/eventos/orden-devuelta` | Órdenes | `orden.devuelta` |
| POST | `/eventos/pago-recibido` | Pagos | `pago.recibido` |

**orden.confirmada** (una línea por vendedor, sin vendedores repetidos)

```json
{
  "eventId": "evt-ord-0001",
  "version": 1,
  "tipo": "orden.confirmada",
  "ocurridoEn": "2026-11-20T15:30:00-05:00",
  "numeroOrden": "ORD-1001",
  "fecha": "2026-11-20T15:29:00-05:00",
  "estado": "CONFIRMADA",
  "moneda": "COP",
  "lineas": [
    { "vendedorId": "V-001", "valorBruto": "150000.00", "categoriaId": "CAT-01" }
  ]
}
```

```json
// 201 Created
{ "eventId": "evt-ord-0001", "resultado": "PROCESADO" }
```

**orden.cancelada**: `numeroOrden`, `fecha`, `motivo`, `lineas: [{ "vendedorId" }]`.
**orden.devuelta**: `numeroOrden`, `fecha`, `motivo`, `lineas: [{ "vendedorId", "valorDevuelto" }]`.

**pago.recibido**

```json
{
  "eventId": "evt-pago-0001",
  "version": 1,
  "tipo": "pago.recibido",
  "ocurridoEn": "2026-11-20T15:35:00-05:00",
  "referenciaPasarela": "PSE-778899",
  "fecha": "2026-11-20T15:34:00-05:00",
  "valor": "150000.00",
  "moneda": "COP",
  "origen": "API",
  "ordenes": ["ORD-1001"]
}
```

```json
// 201 Created
{ "eventId": "evt-pago-0001", "resultado": "PROCESADO", "pagoId": "8f1c…", "estado": "CONCILIADO" }
```

### 3.3 Escrow (custodia del pago de un pedido)

`pedidoId` es el `numeroOrden` del evento `orden.confirmada`. Estados: `SIN_ENTREGA`, `RETENIDO`, `LIBERADO`, `BLOQUEADO`. Tras la entrega el dinero se retiene 72 h y luego se libera solo.

| Método | Ruta | Acceso | Body |
|---|---|---|---|
| POST | `/escrow/marcar-entrega/{pedidoId}` | Servicio (Órdenes) | `{ "fechaEntrega"? }` (opcional) |
| POST | `/escrow/bloquear/{pedidoId}` | Servicio (Órdenes, ante una PQR) | `{ "motivo"? }` (opcional) |
| POST | `/escrow/desbloquear/{pedidoId}` | ADMIN | `{ "motivo" }` (obligatorio) |
| GET | `/escrow/{pedidoId}` | ADMIN | |

```json
// POST /escrow/marcar-entrega/ORD-1001 → 200
{
  "pedidoId": "ORD-1001",
  "estado": "RETENIDO",
  "entregadoEn": "2026-11-21T10:00:00.000Z",
  "liberableDesde": "2026-11-24T10:00:00.000Z",
  "bloqueado": false,
  "bloqueadoEn": null,
  "motivoBloqueo": null,
  "actualizadoEn": "2026-11-21T10:00:00.000Z",
  "resultado": "ACTUALIZADO"
}
```

Un reintento devuelve `"resultado": "SIN_CAMBIOS"`.

### 3.4 Consultas y operaciones contables (usuarios)

| Método | Ruta | Rol | Parámetros / body | Éxito |
|---|---|---|---|---|
| GET | `/comisiones/configuracion` | ADMIN | `?fecha=` | 200 |
| PUT | `/comisiones/configuracion` | ADMIN | `{ "porcentaje": "10", "vigenteDesde": "2026-12-01" }` | 200 |
| GET | `/ventas` | ADMIN | `?desde&hasta&periodo&vendedorId&page&size` | 200 paginado |
| GET | `/ventas/{id}` | ADMIN | `id` UUID | 200 |
| GET | `/periodos` | ADMIN | | 200 |
| GET | `/cuentas-por-pagar` | ADMIN, VENDEDOR | `?periodo&estado&vendedorId` | 200 |
| GET | `/cuentas-por-pagar/resumen` | ADMIN | `?periodo` | 200 |
| GET | `/pagos-recibidos` | ADMIN | `?estado&desde&hasta` | 200 |
| POST | `/pagos-recibidos/importar` | ADMIN | CSV con `Content-Type: text/csv` | 200 |
| POST | `/conciliaciones` | ADMIN | `{ "pagoId", "ordenes": [{ "numeroOrden", "valorAplicado"? }] }` | 201 |
| GET | `/conciliaciones` | ADMIN | `?estado&desde&hasta` | 200 |
| GET | `/conciliaciones/{id}` | ADMIN | `id` UUID | 200 |
| POST | `/ajustes` | ADMIN | `{ "ventaId", "tipo": "DEVOLUCION"\|"CANCELACION", "motivo", "valor"?, "fecha"? }` | 201 |
| GET | `/ajustes` | ADMIN | `?ventaId&vendedorId&desde&hasta&page&size` | 200 paginado |
| GET | `/reportes/ingresos` | ADMIN | `?desde&hasta` (obligatorios) `&vendedorId` | 200 |
| GET | `/exportaciones/excel` | ADMIN | mismos filtros del reporte | 200 archivo `.xlsx` |
| POST | `/pagos-vendedor` | ADMIN | `{ "vendedorId", "valor", "referencia", "soporte"?, "fecha"? }` | 201 |
| GET | `/pagos-vendedor` | ADMIN, VENDEDOR | `?vendedorId&desde&hasta&page&size` | 200 paginado |
| GET | `/vendedores/{id}/estado` | ADMIN, VENDEDOR | `?desde&hasta` (periodos) | 200 |
| GET | `/auditoria` | ADMIN | `?entidad&entidadId&usuario&desde&hasta&page&size` | 200 paginado |

Un VENDEDOR solo ve sus propios datos. En `POST /ajustes`, la `DEVOLUCION` exige `valor` y la `CANCELACION` no lo admite.

```json
// GET /ventas/{id} → 200
{
  "id": "3b0f…",
  "numeroOrden": "ORD-1001",
  "vendedorId": "V-001",
  "vendedorNombre": "Tienda Uno",
  "categoriaId": "CAT-01",
  "fecha": "2026-11-20T20:29:00.000Z",
  "fechaContable": "2026-11-20",
  "periodo": "2026-11-Q2",
  "valorBruto": "150000.00",
  "porcentajeAplicado": "10",
  "comision": "15000.00",
  "valorNeto": "135000.00",
  "estadoOrigen": "CONFIRMADA",
  "registradoEn": "2026-11-20T20:30:01.000Z"
}
```

### 3.5 Eventos que publica Contabilidad

Contabilidad los guarda en su outbox y los entrega por `POST` a la URL que configure cada
consumidor (`OUTBOX_DESTINOS`). Si el destino no responde `2xx`, reintenta con espera exponencial y,
tras 8 fallos, deja el evento en `DEAD_LETTER`. `GET /health` informa cuántos hay pendientes y en
dead-letter.

Cabeceras: `content-type: application/json`, `x-event-id`, `x-event-type`, `x-correlation-id`
(si existe) y `x-api-key` (si el consumidor la exige). El consumidor debe deduplicar por `eventId`.

| `tipo` | Cuándo | Consumidor previsto |
|---|---|---|
| `contabilidad.pago-vendedor.registrado` (v2) | Pago acreditado a un vendedor | Notificaciones (HU-NOT-05) |
| `contabilidad.venta.registrada` | Venta, comisión y cuenta por pagar creadas | |
| `contabilidad.ajuste.registrado` | Ajuste por devolución o cancelación | |
| `contabilidad.conciliacion.cerrada` | Conciliación marcada como conciliada | |
| `contabilidad.escrow.actualizado` | Cambio de estado del escrow de un pedido | |

```json
// contabilidad.pago-vendedor.registrado (v2)
{
  "eventId": "6f0c…",
  "tipo": "contabilidad.pago-vendedor.registrado",
  "modulo": "contabilidad",
  "ocurridoEn": "2026-11-25T15:00:00.000Z",
  "correlationId": "c0a8…",
  "payload": {
    "version": 2,
    "pagoId": "9d2e…",
    "vendedorId": "V-001",
    "fecha": "2026-11-25T15:00:00.000Z",
    "valor": "135000.00",
    "moneda": "COP",
    "saldoAFavorAplicado": "0.00",
    "referencia": "TRF-0001",
    "ordenes": ["ORD-1001"],
    "cuentas": [
      {
        "periodo": "2026-11-Q2",
        "valorAplicado": "135000.00",
        "saldoAnterior": "135000.00",
        "saldoNuevo": "0.00",
        "estado": "PAGADO",
        "ordenes": ["ORD-1001"]
      }
    ]
  }
}
```

## 4. Errores

Todos los errores usan RFC 7807 (`application/problem+json`):

```json
{
  "type": "https://marketplace/contabilidad/errores/VALIDACION",
  "title": "Datos inválidos",
  "status": 400,
  "code": "VALIDACION",
  "correlationId": "c0a8…",
  "errors": [{ "path": "lineas.0.valorBruto", "message": "El monto debe ser mayor que cero" }]
}
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 200 | | Consulta correcta, evento repetido (`YA_PROCESADO`) o ignorado |
| 201 | | Recurso creado o evento procesado por primera vez |
| 400 | `VALIDACION` | Cuerpo o parámetros inválidos, JSON mal formado, CSV inválido |
| 401 | `NO_AUTENTICADO` | Falta token o `x-api-key`, o no son válidos |
| 403 | `NO_AUTORIZADO` | El rol o servicio no tiene permiso |
| 404 | `NO_ENCONTRADO`, `ORDEN_INEXISTENTE`, `PAGO_INEXISTENTE` | Ruta o recurso inexistente |
| 409 | `CONFLICTO`, `ORDEN_DUPLICADA`, `REFERENCIA_DUPLICADA`, `CONCILIACION_DUPLICADA` | Registro duplicado o vigencias solapadas |
| 413 | `VALIDACION` | Cuerpo mayor a 1 MB |
| 422 | `REGLA_DE_NEGOCIO`, `ORDEN_NO_CONFIRMADA`, `COMISION_NO_CONFIGURADA`, `AJUSTE_EXCEDE_SALDO`, `APLICADO_EXCEDE_SALDO`, `PAGO_EXCEDE_SALDO`, `SALDO_RETENIDO_ESCROW` | Se incumple una regla contable |
| 429 | `DEMASIADAS_PETICIONES` | Se superó el límite de peticiones |
| 500 | `ERROR_INTERNO` | Error no controlado |
| 503 | | `/health` con la base de datos caída |

## 5. Versionado

- Esta es la v1. Los cambios compatibles (campos opcionales nuevos) no cambian la versión.
- Un cambio incompatible sube `version` en los eventos y se publica con un nuevo prefijo.
- El consumidor debe ignorar los campos que no conozca.
