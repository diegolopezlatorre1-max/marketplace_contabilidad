# URL del repositorio y bloqueos · Módulo de Contabilidad

## 1. Repositorio

| Elemento | Valor |
|---|---|
| URL | <https://github.com/diegolopezlatorre1-max/marketplace_contabilidad> |
| Clonar (SSH) | `git@github.com:diegolopezlatorre1-max/marketplace_contabilidad.git` |
| Rama de despliegue | `main` (Render despliega automáticamente desde ella, ver `render.yaml`) |
| Rama de integración | `dev` (los cambios pasan a `main` con un PR de `dev` a `main`) |

## 2. Bloqueos restantes

Cada bloqueo indica de quién depende y qué queda afectado mientras no se resuelva.

| # | Bloqueo | Depende de | Efecto actual |
|---|---|---|---|
| B-01 | Falta la URL real del servicio en Render. Los documentos usan el marcador `https://<servicio>.onrender.com`. | Equipo 6 (Render) | Los entregables 2 y 3 no tienen una URL que se pueda probar. |
| B-02 | Falta `DATABASE_URL` (Session pooler) y el certificado SSL de Supabase. Solo se tiene la URL de JWKS. | Administrador de Supabase | El esquema `contabilidad` no está en Supabase; el endpoint real no tiene base de datos. |
| B-03 | No está confirmado dónde viene el rol del usuario (se espera `app_metadata.role` y `app_metadata.vendedor_id`). No hay usuarios de prueba por rol. | Administrador de Supabase | Si el rol viene en otro campo, todos los usuarios reciben 403. |
| B-04 | Falta la URL (y la clave, si la exigen) para enviar el evento de pago acreditado (HU-NOT-05). | Equipo de Notificaciones (Equipo 3) | El evento se genera en el outbox, pero no se entrega. |
| B-05 | Ningún módulo llama a `POST /escrow/bloquear/{pedido_id}`; no existe un módulo de PQR. | Profesor o coordinador | La ruta existe, pero nadie la usa. |

**Pendientes no bloqueantes**

| # | Pendiente | Depende de | Efecto actual |
|---|---|---|---|
| B-06 | Hoy no hay una API de Vendedores que consumir. El adaptador ya existe: cuando haya API, basta con configurar `INTEGRATION_MODE=http` y `VENDEDORES_URL` y confirmar la ruta `GET /vendedores?ids=...`. | Equipo de Vendedores, si llega a existir | Ninguno: los nombres salen de `MockSellersGateway`. |
| B-07 | Supuestos de `orden.confirmada` sin confirmar: S-01 `valorBruto` sin envío ni impuestos, S-02 estado exacto `"CONFIRMADA"`, S-03 `eventId` estable entre reintentos. Tampoco está confirmado que Órdenes llamará a `POST /escrow/marcar-entrega/{pedido_id}`. | Equipo de Órdenes | Si algún supuesto es falso, las comisiones salen mal o se duplican ventas. |

## 3. Orden sugerido

1. B-02 y B-03: con la base de datos y los roles, el endpoint real queda operativo y se obtiene la URL (B-01).
2. B-04 y B-05: obtener la URL de Notificaciones y definir quién bloquea el escrow.
3. B-06 y B-07: confirmarlos con Vendedores y Órdenes cuando sea posible.
