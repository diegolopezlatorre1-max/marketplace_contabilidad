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
| B-04 | `bootstrap/container.ts` siempre usa los adaptadores simulados, aunque cambie `INTEGRATION_MODE`. `render.yaml` además fija `INTEGRATION_MODE=mock`. | Equipo 6, cuando los otros módulos expongan sus APIs | Órdenes, Pagos y Vendedores siguen simulados también en producción. |
| B-05 | El adaptador HTTP de Vendedores (`HttpSellersGateway`) es solo una propuesta; no hay código. | Equipo de Vendedores (contrato de su API) y Equipo 6 | Los datos de vendedores salen de `MockSellersGateway`. |
| B-06 | Supuestos de `orden.confirmada` sin confirmar: S-01 `valorBruto` sin envío ni impuestos, S-02 estado exacto `"CONFIRMADA"`, S-03 `eventId` estable entre reintentos. Tampoco está confirmado que Órdenes llamará a `POST /escrow/marcar-entrega/{pedido_id}`. | Equipo de Órdenes | Si algún supuesto es falso, las comisiones salen mal o se duplican ventas. |
| B-07 | No se sabe si `pago.recibido` llega neto o bruto de los costos de la pasarela, ni si Pagos usa el mismo número de orden que Órdenes. | Equipo de Pagos | La conciliación puede mostrar diferencias falsas. |
| B-08 | Falta la URL (y la clave, si la exigen) para enviar el evento de pago acreditado (HU-NOT-05). | Equipo de Notificaciones (Equipo 3) | El evento se genera en el outbox, pero no se entrega. |
| B-09 | Ningún módulo llama a `POST /escrow/bloquear/{pedido_id}`; no existe un módulo de PQR. | Profesor o coordinador | La ruta existe, pero nadie la usa. |
| B-10 | Decisiones por defecto sin validar con el contador: D-03 periodo quincenal (Q1 días 1 a 15, Q2 día 16 a fin de mes) y D-07 el ajuste revierte el neto en la quincena de la venta. | Contador | Si cambian, hay que ajustar `Periodo.ts` y `aplicarAjuste.ts`. |
| B-11 | ~~Pruebas de integración sin ejecutar.~~ **Resuelto el 2026-11-24:** 14 archivos, 87 de 87 pruebas pasan contra PostgreSQL 16 (`TEST_DATABASE_URL`, `npm run test:integration`). Con las 295 unitarias y los 22 casos de F08 no quedan pruebas sin correr. | Equipo 6 | Ninguno. |
| B-12 | Los entregables 2 a 5 y este documento, el script `probar:auth` y el entorno de Postman para Render están solo en la copia local (rama `feat/herramientas-entrega`, sin publicar). | Equipo 6 | No aparecen en el repositorio hasta que se suba la rama y se fusione en `main`. |

## 3. Orden sugerido

1. B-12: subir la rama y fusionarla, para que el repositorio tenga los entregables.
2. B-02 y B-03: con la base de datos y los roles, el endpoint real queda operativo y se obtiene la URL (B-01).
3. B-06 a B-10: cerrar los supuestos con cada equipo; luego B-04 y B-05 cuando expongan sus APIs.
