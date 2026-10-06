# ADR 0003 — Idempotencia (inbox) y publicación confiable (outbox)

- Estado: Aceptada
- Fecha: 2026-10-05

## Contexto

HU-CON-01 exige que una misma orden no se registre dos veces. Los eventos entre
módulos pueden llegar repetidos o en paralelo.

## Decisión

- **Inbox**: cada evento entrante se registra por `eventId` (UNIQUE) dentro de la
  misma transacción que sus efectos. Si ya existe, se responde `YA_PROCESADO`.
- Segunda barrera: restricciones UNIQUE de negocio (p. ej. `numero_orden + vendedor_id`).
  Una violación (`23505`) se traduce a 409 o a `YA_PROCESADO`.
- Eventos que no aplican (estado ≠ confirmada) se guardan en `evento_ignorado`.
- **Outbox**: los eventos que publica contabilidad se escriben en `contabilidad.outbox`
  en la misma transacción; un relay (Fase 5/6) los entrega al marketplace.
- Todo ocurre dentro de `UnitOfWork.run()` (una transacción de PostgreSQL).

## Consecuencias

Reintentos seguros desde Órdenes y Pagos; ningún evento de contabilidad se pierde
ni se publica sin que el cambio de negocio se haya confirmado.
