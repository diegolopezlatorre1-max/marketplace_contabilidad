# Pruebas de la API con Postman

Colección: [`contabilidad.postman_collection.json`](contabilidad.postman_collection.json)
(formato Postman v2.1). Recorre la API en orden de demo y verifica cada respuesta.

## Antes de empezar

```bash
npm run db:migrate && npm run db:seed   # esquema y comisión global del 10 %
npm run dev:api                         # API en http://localhost:3000 (AUTH_MODE=mock)
```

## Opción 1: Postman

1. *Import* → arrastre `docs/postman/contabilidad.postman_collection.json`.
2. Abra la colección → *Run collection* → *Run*. Ejecútela **completa y en orden**, porque
   cada carpeta usa datos que guardan las anteriores.
3. Para probar un request suelto, ejecute antes los que lo preceden en su carpeta.

Variables de la colección (pestaña *Variables*):

| Variable | Valor | Uso |
|----------|-------|-----|
| `baseUrl` | `http://localhost:3000/api/v1/contabilidad` | URL base |
| `tokenContador` | `mock-contador` | Consultas (rol CONTADOR) |
| `tokenAdmin` | `mock-admin` | Configurar comisión (rol ADMIN_FINANCIERO) |
| `tokenSistema` | `mock-sistema` | Eventos de Órdenes (rol SISTEMA) |

## Opción 2: terminal (Newman)

Sin instalar nada en el repositorio:

```bash
npx newman run docs/postman/contabilidad.postman_collection.json
```

## Qué prueba

| Carpeta | Casos |
|---------|-------|
| 1. Sistema | `/health` sin token; `/me` con cada rol; sin token → 401 |
| 2. HU-CON-09 Comisión | consulta del % vigente; contador → 403; % inválido → 400; vigencia solapada → 409; administrador → 200 (la anterior se cierra el día previo) |
| 3. HU-CON-01 Registrar venta | orden multi-vendedor → 201 PROCESADO; reenvío → YA_PROCESADO; misma orden con otro eventId → 409 ORDEN_DUPLICADA; orden PENDIENTE → IGNORADO; evento inválido → 400; contador → 403 |
| 4. Consultas | `/ventas` (una sola venta por vendedor, comisión con el % vigente, bruto = comisión + neto); `/periodos`; `/cuentas-por-pagar` (saldo = neto); filtro inválido → 400 |
| 5. HU-CON-06 Ajustes | devolución parcial de 30.000 → 201 (reverso con el % original); exceso → 422 AJUSTE_EXCEDE_SALDO; cancelación del resto → 201; venta inexistente → 404; historial suma el bruto; evento `orden.cancelada` → 201 y reenvío → YA_PROCESADO; saldo del vendedor 2 en 0 |

Cada ejecución crea una orden nueva, con vendedores `V-PM-<marca de tiempo>`, así que se
puede repetir las veces que haga falta.

**Comisión:** para no cambiar el % de la base de desarrollo, el paso "Configurar como
administrador" registra **el mismo porcentaje vigente** en la siguiente fecha válida (hoy
o el día después del inicio de la vigencia actual). El % no cambia, pero cada ejecución
agrega una vigencia al historial. Para probar un cambio real (por ejemplo al 12 %),
edite el cuerpo de ese request.

## Alternativa: colección generada del contrato

Postman también puede generar una colección a partir del contrato OpenAPI que publica
la API: *Import* → *Link* → `http://localhost:3000/api/v1/contabilidad/openapi.json`.
Trae todos los endpoints y ejemplos, pero sin tokens por rol ni verificaciones. Cambie
`baseUrl` a `http://localhost:3000/api/v1/contabilidad`.

La documentación interactiva (Swagger) está en
`http://localhost:3000/api/v1/contabilidad/docs`, y en la interfaz web, en el menú
"Documentación API".
