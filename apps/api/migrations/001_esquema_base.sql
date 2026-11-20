-- Fase 1: esquema propio del módulo y tablas transversales.
-- El esquema "contabilidad" aísla el módulo: funciona igual en una BD dedicada
-- o compartida con el resto del marketplace (docs/adr/0001).

CREATE SCHEMA IF NOT EXISTS contabilidad;

-- Auditoría de todos los comandos (H-11, HU-CON-11). Solo inserciones.
CREATE TABLE contabilidad.auditoria (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidad             VARCHAR(64)  NOT NULL,
  entidad_id          VARCHAR(100) NOT NULL,
  accion              VARCHAR(64)  NOT NULL,
  usuario             VARCHAR(100) NOT NULL,
  fecha               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  valores_anteriores  JSONB,
  valores_nuevos      JSONB,
  correlation_id      VARCHAR(100)
);
CREATE INDEX ix_auditoria_entidad ON contabilidad.auditoria (entidad, entidad_id);
CREATE INDEX ix_auditoria_fecha   ON contabilidad.auditoria (fecha);
CREATE INDEX ix_auditoria_usuario ON contabilidad.auditoria (usuario, fecha);

-- Eventos entrantes ya procesados: idempotencia (docs/adr/0003).
CREATE TABLE contabilidad.inbox (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      VARCHAR(100) NOT NULL,
  tipo          VARCHAR(64)  NOT NULL,
  payload       JSONB        NOT NULL,
  procesado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_inbox_event_id UNIQUE (event_id)
);

-- Eventos recibidos que no generan registro (p. ej. orden en estado distinto a confirmada).
CREATE TABLE contabilidad.evento_ignorado (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id   VARCHAR(100) NOT NULL,
  tipo       VARCHAR(64)  NOT NULL,
  motivo     VARCHAR(500) NOT NULL,
  payload    JSONB        NOT NULL,
  creado_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_evento_ignorado_event_id ON contabilidad.evento_ignorado (event_id);

-- Eventos salientes pendientes de publicar (patrón outbox).
CREATE TABLE contabilidad.outbox (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo          VARCHAR(100) NOT NULL,
  payload       JSONB        NOT NULL,
  creado_en     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  publicado_en  TIMESTAMPTZ,
  intentos      INTEGER      NOT NULL DEFAULT 0
);
CREATE INDEX ix_outbox_pendientes ON contabilidad.outbox (creado_en) WHERE publicado_en IS NULL;
