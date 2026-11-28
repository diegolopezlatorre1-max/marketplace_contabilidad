# URL del repositorio y bloqueos · Módulo de Contabilidad

## 1. Repositorio

| Elemento | Valor |
|---|---|
| URL | <https://github.com/diegolopezlatorre1-max/marketplace_contabilidad> |
| Clonar (SSH) | `git@github.com:diegolopezlatorre1-max/marketplace_contabilidad.git` |
| Rama de despliegue | `main` (Render despliega desde ella con *Manual Deploy*) |
| Servicio desplegado | <https://marketplace-contabilidad-api.onrender.com> (Swagger en `/docs`) |
| Rama de integración | `dev` (los cambios pasan a `main` con un PR de `dev` a `main`) |

## 2. Bloqueos restantes

Cada bloqueo indica de quién depende y qué queda afectado mientras no se resuelva.

| # | Bloqueo | Depende de | Efecto actual |
|---|---|---|---|
| B-03 | No está confirmado dónde viene el rol del usuario (se espera `app_metadata.role` y `app_metadata.vendedor_id`). No hay usuarios de prueba por rol. | Administrador de Supabase | Si el rol viene en otro campo, todos los usuarios reciben 403. |
| B-07 | Supuestos de `orden.confirmada` sin confirmar: S-01 `valorBruto` sin envío ni impuestos, S-02 estado exacto `"CONFIRMADA"`, S-03 `eventId` estable entre reintentos. Falta que Órdenes confirme que llamará a `POST /escrow/marcar-entrega/{pedido_id}` y a `POST /escrow/bloquear/{pedido_id}` (ante una PQR). | Equipo de Órdenes | Si algún supuesto es falso, las comisiones salen mal o se duplican ventas; sin esas llamadas, el escrow no retiene ni bloquea pagos. |

**Pendientes no bloqueantes**

| # | Pendiente | Depende de | Efecto actual |
|---|---|---|---|
| B-06 | Hoy no hay una API de Vendedores que consumir. El adaptador ya existe: cuando haya API, basta con configurar `INTEGRATION_MODE=http` y `VENDEDORES_URL` y confirmar la ruta `GET /vendedores?ids=...`. | Equipo de Vendedores, si llega a existir | Ninguno: los nombres salen de `MockSellersGateway`. |

**Resueltos:** B-01 (URL de Render), B-02 (BD en un proyecto Supabase propio del módulo), B-04 (Notificaciones entregó su URL y su clave; el evento de pago acreditado se probó de punta a punta el 2026-11-27) y B-05 (`POST /escrow/bloquear/{pedido_id}` lo llama Órdenes).

## 3. Orden sugerido

1. B-03: confirmar dónde viene el rol para que los usuarios reales puedan operar en el endpoint desplegado.
2. B-07: confirmar con Órdenes los supuestos y las llamadas de escrow (`marcar-entrega` y `bloquear`).
3. B-06: cuando Vendedores publique su URL.
