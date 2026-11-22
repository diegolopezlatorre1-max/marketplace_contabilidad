-- Fase 6 (GUIA_EQUIPO_6, sección 7): publicación del outbox con reintentos y dead-letter.
--  - event_id:          identificador estable del evento, para que el consumidor deduplique.
--  - correlation_id:    x-correlation-id de la petición que originó el evento.
--  - estado:            PENDIENTE → PUBLICADO, o DEAD_LETTER tras agotar los reintentos.
--  - siguiente_intento: cuándo puede reintentarse (backoff exponencial).
--  - ultimo_error:      motivo del último fallo de entrega.

ALTER TABLE contabilidad.outbox
  ADD COLUMN event_id          UUID          NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN correlation_id    VARCHAR(100),
  ADD COLUMN estado            VARCHAR(16)   NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN siguiente_intento TIMESTAMPTZ   NOT NULL DEFAULT now(),
  ADD COLUMN ultimo_error      VARCHAR(1000),
  ADD CONSTRAINT uq_outbox_event_id UNIQUE (event_id),
  ADD CONSTRAINT ck_outbox_estado CHECK (estado IN ('PENDIENTE', 'PUBLICADO', 'DEAD_LETTER')),
  ADD CONSTRAINT ck_outbox_publicado CHECK ((estado = 'PUBLICADO') = (publicado_en IS NOT NULL));

-- Eventos ya marcados como publicados antes de esta migración.
UPDATE contabilidad.outbox SET estado = 'PUBLICADO' WHERE publicado_en IS NOT NULL;

-- El relay toma los pendientes cuyo reintento ya venció, en orden de llegada.
DROP INDEX IF EXISTS contabilidad.ix_outbox_pendientes;
CREATE INDEX ix_outbox_pendientes
  ON contabilidad.outbox (siguiente_intento, id)
  WHERE estado = 'PENDIENTE';
