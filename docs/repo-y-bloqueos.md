# URL del repositorio y bloqueos · Módulo de Contabilidad

## 1. Repositorio

| Elemento | Valor |
|---|---|
| URL | <https://github.com/diegolopezlatorre1-max/marketplace_contabilidad> |
| Clonar (SSH) | `git@github.com:diegolopezlatorre1-max/marketplace_contabilidad.git` |
| Rama de despliegue | `main` (Render despliega automáticamente desde ella, ver `render.yaml`) |
| Último cambio en `main` | PR #29, autenticación por JWKS de Supabase (`AUTH_MODE=jwks`) |

## 2. Bloqueos restantes

Cada bloqueo indica de quién depende y qué queda afectado mientras no se resuelva.

| # | Bloqueo | Depende de | Efecto actual |
|---|---|---|---|
| B-01 | Falta la URL real del servicio en Render. Los documentos usan el marcador `https://<servicio>.onrender.com`. | Equipo 6 (Render) | Los entregables 2 y 3 no tienen una URL que se pueda probar. |
| B-02 | Falta `DATABASE_URL` (Session pooler) y el certificado SSL de Supabase. Solo se tiene la URL de JWKS. | Administrador de Supabase | El esquema `contabilidad` no está en Supabase; el endpoint real no tiene base de datos. |
| B-03 | No está confirmado dónde viene el rol del usuario (se espera `app_metadata.role` y `app_metadata.vendedor_id`). No hay usuarios de prueba por rol. | Administrador de Supabase | Si el rol viene en otro campo, todos los usuarios reciben 403. |
| B-04 | ~~`bootstrap/container.ts` ignora `INTEGRATION_MODE`.~~ **Resuelto el 2026-11-24 (PR #32 en `main`; falta llevarlo a `dev`):** con `mock` usa el catálogo simulado; con `http` o `events`, el adaptador HTTP de Vendedores. Órdenes y Pagos no necesitan adaptador porque envían eventos a esta API. Render sigue en `mock`. | Equipo 6 | Ninguno. |
| B-05 | **Pendiente, no bloqueante.** Hoy no hay una API de Vendedores que consumir. El código ya está en `main` (PR #32): cuando exista, basta con configurar `INTEGRATION_MODE=http` y `VENDEDORES_URL` y confirmar la ruta `GET /vendedores?ids=...`. | Equipo de Vendedores, si llega a existir | Ninguno: los nombres salen de `MockSellersGateway`. |
| B-06 | **Pendiente, no bloqueante.** Supuestos de `orden.confirmada` sin confirmar: S-01 `valorBruto` sin envío ni impuestos, S-02 estado exacto `"CONFIRMADA"`, S-03 `eventId` estable entre reintentos. Tampoco está confirmado que Órdenes llamará a `POST /escrow/marcar-entrega/{pedido_id}`. | Equipo de Órdenes | Si algún supuesto es falso, las comisiones salen mal o se duplican ventas. |
| B-07 | ~~Valor de `pago.recibido` y número de orden sin confirmar.~~ **Resuelto el 2026-11-24:** el valor llega bruto, los costos de la pasarela se envían por separado y Pagos usa el mismo número de orden que Órdenes. El contrato v1 no tiene campo para esos costos; la conciliación compara el valor bruto y no los necesita. | Equipo de Pagos | Ninguno. |
| B-08 | Falta la URL (y la clave, si la exigen) para enviar el evento de pago acreditado (HU-NOT-05). | Equipo de Notificaciones (Equipo 3) | El evento se genera en el outbox, pero no se entrega. |
| B-09 | Ningún módulo llama a `POST /escrow/bloquear/{pedido_id}`; no existe un módulo de PQR. | Profesor o coordinador | La ruta existe, pero nadie la usa. |
| B-10 | ~~Decisiones por defecto sin validar.~~ **Resuelto el 2026-11-24:** validadas D-03 (periodo quincenal: Q1 días 1 a 15, Q2 día 16 a fin de mes) y D-07 (el ajuste revierte el neto en la quincena de la venta). | Contador | Ninguno. |
| B-11 | ~~Pruebas de integración sin ejecutar.~~ **Resuelto el 2026-11-24:** 14 archivos, 87 de 87 pruebas pasan contra PostgreSQL 16 (`TEST_DATABASE_URL`, `npm run test:integration`). Con las 295 unitarias y los 22 casos de F08 no quedan pruebas sin correr. | Equipo 6 | Ninguno. |
| B-12 | ~~Entregables solo en la copia local.~~ **Resuelto el 2026-11-24 (PR #31 en `dev`):** los entregables 1 a 6, el script `probar:auth` y el entorno de Postman para Render están en el repositorio. Pasan a `main` con el siguiente PR de `dev` a `main`. | Equipo 6 | Ninguno. |

## 3. Orden sugerido

1. B-02 y B-03: con la base de datos y los roles, el endpoint real queda operativo y se obtiene la URL (B-01).
2. B-06, B-08 y B-09: cerrar los supuestos y las URL con cada equipo.
