# JSON + HTTP · Módulo de Contabilidad

Ejemplos de peticiones y respuestas de la API, tomados de las rutas de `apps/api/src/infrastructure/http` y de los esquemas de `packages/contracts`. Siguen el [Contrato API v1](contrato-api-v1.md) y funcionan igual contra el endpoint real o el mock (ver [Endpoint real o mock](endpoint-real-o-mock.md)).

## 1. Reglas comunes

| Elemento | Valor |
|---|---|
| Base URL | Real: `https://<servicio>.onrender.com/api/contabilidad` · Mock: `http://localhost:3000/api/contabilidad` |
| Cuerpo de la petición | `Content-Type: application/json` (máx. 1 MB). Solo la importación de pagos usa `text/csv`. |
| Respuesta correcta | `Content-Type: application/json` |
| Respuesta de error | `Content-Type: application/problem+json` (RFC 7807) |
| Autenticación de usuarios | `Authorization: Bearer <token>` (en el mock: `mock-admin`, `mock-vendedor`) |
| Autenticación de módulos | `x-api-key: <clave>` (en el mock: `Authorization: Bearer mock-sistema`) |
| Trazabilidad | `x-correlation-id`: se devuelve el recibido o uno nuevo (UUID) |
| Límite de peticiones | Cabeceras `RateLimit` y `RateLimit-Policy` (no aplica a `/health` ni `/docs`) |

En los ejemplos, `HTTP/1.1 201 Created` indica el código y las líneas siguientes, las cabeceras relevantes.

## 2. Métodos y códigos usados

| Método | Uso en la API |
|---|---|
| `GET` | Consultas: health, ventas, cuentas, reportes, escrow, auditoría |
| `POST` | Eventos entrantes, conciliaciones, ajustes, pagos a vendedores, acciones de escrow |
| `PUT` | Configurar la comisión vigente |

| Código | Significado |
|---|---|
| `200 OK` | Consulta correcta, evento repetido (`YA_PROCESADO`) o ignorado, acción de escrow |
| `201 Created` | Evento procesado por primera vez o recurso creado |
| `400 Bad Request` | Validación, JSON mal formado, CSV inválido |
| `401 Unauthorized` | Falta el token o la `x-api-key`, o no son válidos |
| `403 Forbidden` | Rol o servicio sin permiso |
| `404 Not Found` | Ruta o recurso inexistente |
| `409 Conflict` | Duplicado o vigencias solapadas |
| `413 Payload Too Large` | Cuerpo mayor a 1 MB |
| `422 Unprocessable Entity` | Regla contable incumplida |
| `429 Too Many Requests` | Límite de peticiones superado |
| `500` / `503` | Error interno / base de datos caída en `/health` |

## 3. Ejemplos correctos

### 3.1 Health

```http
GET /health
```

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
x-correlation-id: 5d2c7e0a-8b1f-4a63-9e0d-2f4b9c1a7e55
```

```json
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

Con la base de datos caída responde `503` con `"status": "degradado"`.

### 3.2 Evento orden confirmada (Órdenes → Contabilidad)

```http
POST /api/contabilidad/eventos/orden-confirmada
Content-Type: application/json
x-api-key: <clave-ordenes>
x-correlation-id: ord-1001-a
```

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

```http
HTTP/1.1 201 Created
x-correlation-id: ord-1001-a
```

```json
{ "eventId": "evt-ord-0001", "resultado": "PROCESADO" }
```

Si se reenvía el mismo `eventId`:

```http
HTTP/1.1 200 OK
```

```json
{ "eventId": "evt-ord-0001", "resultado": "YA_PROCESADO" }
```

### 3.3 Evento pago recibido (Pagos → Contabilidad)

```http
POST /api/contabilidad/eventos/pago-recibido
Content-Type: application/json
x-api-key: <clave-pagos>
```

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

```http
HTTP/1.1 201 Created
```

```json
{
  "eventId": "evt-pago-0001",
  "resultado": "PROCESADO",
  "pagoId": "8f1c2a90-4d3e-4b7a-9c11-0e6f5a2b3c4d",
  "estado": "CONCILIADO"
}
```

### 3.4 Configurar comisión (ADMIN)

```http
PUT /api/contabilidad/comisiones/configuracion
Content-Type: application/json
Authorization: Bearer mock-admin
```

```json
{ "porcentaje": "10", "vigenteDesde": "2026-12-01" }
```

```http
HTTP/1.1 200 OK
```

```json
{
  "fecha": "2026-12-01",
  "vigente": {
    "id": "c7a1e4f2-…",
    "porcentaje": "10",
    "alcance": "GLOBAL",
    "referenciaId": null,
    "vigenteDesde": "2026-12-01",
    "vigenteHasta": null,
    "creadoPor": "u-admin"
  },
  "historial": [
    { "id": "c7a1e4f2-…", "porcentaje": "10", "vigenteDesde": "2026-12-01", "vigenteHasta": null, "…": "…" },
    { "id": "9b20d3aa-…", "porcentaje": "8", "vigenteDesde": "2026-11-01", "vigenteHasta": "2026-11-30", "…": "…" }
  ]
}
```

`historial` va de la vigencia más reciente a la más antigua; al crear una nueva, la anterior queda cerrada el día antes.

### 3.5 Listar cuentas por pagar (ADMIN o VENDEDOR)

```http
GET /api/contabilidad/cuentas-por-pagar?periodo=2026-11-Q2&estado=PENDIENTE
Authorization: Bearer mock-admin
```

```http
HTTP/1.1 200 OK
```

```json
[
  {
    "vendedorId": "V-001",
    "vendedorNombre": "Tienda Uno",
    "periodo": "2026-11-Q2",
    "totalNeto": "135000.00",
    "valorPagado": "0.00",
    "saldoPendiente": "135000.00",
    "estado": "PENDIENTE"
  }
]
```

Con `mock-vendedor` solo aparecen las cuentas de ese vendedor.

### 3.6 Conciliar un pago (ADMIN)

```http
POST /api/contabilidad/conciliaciones
Content-Type: application/json
Authorization: Bearer mock-admin
```

```json
{
  "pagoId": "8f1c2a90-4d3e-4b7a-9c11-0e6f5a2b3c4d",
  "ordenes": [{ "numeroOrden": "ORD-1001", "valorAplicado": "150000.00" }]
}
```

```http
HTTP/1.1 201 Created
```

```json
{
  "id": "1e9b…",
  "pagoId": "8f1c2a90-4d3e-4b7a-9c11-0e6f5a2b3c4d",
  "referenciaPasarela": "PSE-778899",
  "fechaPago": "2026-11-20T20:34:00.000Z",
  "valorPago": "150000.00",
  "valorAplicado": "150000.00",
  "diferencia": "0.00",
  "estado": "CONCILIADA",
  "usuario": "u-admin",
  "fecha": "2026-11-21T14:00:00.000Z",
  "detalles": [
    { "numeroOrden": "ORD-1001", "valorOrden": "150000.00", "valorAplicado": "150000.00" }
  ]
}
```

### 3.7 Registrar pago a un vendedor (ADMIN)

```http
POST /api/contabilidad/pagos-vendedor
Content-Type: application/json
Authorization: Bearer mock-admin
```

```json
{ "vendedorId": "V-001", "valor": "135000.00", "referencia": "TRF-2026-0042" }
```

```http
HTTP/1.1 201 Created
```

```json
{
  "id": "a4d2…",
  "vendedorId": "V-001",
  "fecha": "2026-11-25T15:00:00.000Z",
  "fechaContable": "2026-11-25",
  "valor": "135000.00",
  "saldoAFavorAplicado": "0.00",
  "referencia": "TRF-2026-0042",
  "soporte": null,
  "aplicaciones": [
    {
      "periodo": "2026-11-Q2",
      "valorAplicado": "135000.00",
      "saldoAnterior": "135000.00",
      "saldoNuevo": "0.00",
      "estado": "PAGADO"
    }
  ],
  "registradoPor": "u-admin",
  "registradoEn": "2026-11-25T15:00:00.000Z"
}
```

### 3.8 Marcar entrega en escrow (Órdenes)

```http
POST /api/contabilidad/escrow/marcar-entrega/ORD-1001
Content-Type: application/json
x-api-key: <clave-ordenes>
```

```json
{ "fechaEntrega": "2026-11-21T10:00:00.000Z" }
```

```http
HTTP/1.1 200 OK
```

```json
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

### 3.9 Exportar a Excel (ADMIN)

```http
GET /api/contabilidad/exportaciones/excel?desde=2026-11-01&hasta=2026-11-30
Authorization: Bearer mock-admin
```

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="contabilidad_2026-11-01_2026-11-30.xlsx"
Cache-Control: no-store
```

El cuerpo es el archivo binario, no JSON.

## 4. Ejemplos de error

Todos los errores tienen la misma forma: `type`, `title`, `status`, `code`, `correlationId` y, según el caso, `detail` o `errors`.

**400 · Validación**

```http
POST /api/contabilidad/eventos/orden-confirmada
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json; charset=utf-8
```

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

**401 · Sin credenciales**

```http
GET /api/contabilidad/ventas
```

```json
{
  "type": "https://marketplace/contabilidad/errores/NO_AUTENTICADO",
  "title": "No autenticado",
  "status": 401,
  "code": "NO_AUTENTICADO",
  "detail": "Credenciales ausentes o inválidas",
  "correlationId": "c0a8…"
}
```

**403 · Rol sin permiso**

```http
GET /api/contabilidad/ventas
Authorization: Bearer mock-comprador
```

```json
{
  "type": "https://marketplace/contabilidad/errores/NO_AUTORIZADO",
  "title": "No autorizado",
  "status": 403,
  "code": "NO_AUTORIZADO",
  "detail": "No tiene permisos para realizar esta operación",
  "correlationId": "c0a8…"
}
```

**404 · Recurso inexistente**

```http
GET /api/contabilidad/conciliaciones/00000000-0000-0000-0000-000000000000
Authorization: Bearer mock-admin
```

```json
{
  "type": "https://marketplace/contabilidad/errores/NO_ENCONTRADO",
  "title": "No encontrado",
  "status": 404,
  "code": "NO_ENCONTRADO",
  "detail": "No existe la conciliación 00000000-0000-0000-0000-000000000000",
  "correlationId": "c0a8…"
}
```

**409 · Vigencia de comisión solapada**

```json
{
  "type": "https://marketplace/contabilidad/errores/CONFLICTO",
  "title": "El registro se solapa con otro existente",
  "status": 409,
  "code": "CONFLICTO",
  "correlationId": "c0a8…"
}
```

**422 · Regla contable** (pago mayor que el saldo del vendedor)

```json
{
  "type": "https://marketplace/contabilidad/errores/PAGO_EXCEDE_SALDO",
  "title": "Regla de negocio incumplida",
  "status": 422,
  "code": "PAGO_EXCEDE_SALDO",
  "detail": "El pago de 200000.00 supera lo que se le debe al vendedor V-001: 135000.00",
  "correlationId": "c0a8…"
}
```

**429 · Demasiadas peticiones**

```json
{
  "type": "https://marketplace/contabilidad/errores/DEMASIADAS_PETICIONES",
  "title": "Demasiadas peticiones",
  "status": 429,
  "detail": "Se superó el límite de peticiones; intente de nuevo más tarde",
  "code": "DEMASIADAS_PETICIONES"
}
```

## 5. Ruta obsoleta

Las mismas rutas responden bajo `/api/v1/contabilidad`, con dos cabeceras extra:

```http
HTTP/1.1 200 OK
Deprecation: true
Link: </api/contabilidad>; rel="successor-version"
```
