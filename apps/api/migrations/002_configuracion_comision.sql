-- HU-CON-09: porcentaje de comisión con vigencias (decisión D-04).
-- Alcances GLOBAL, VENDEDOR y CATEGORIA (prioridad vendedor > categoría > global);
-- en el Sprint 1 solo se configura GLOBAL.

-- Permite combinar igualdad (=) y rangos (&&) en la restricción EXCLUDE.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE contabilidad.configuracion_comision (
  id             UUID          PRIMARY KEY,
  porcentaje     NUMERIC(7,4)  NOT NULL,
  alcance        VARCHAR(16)   NOT NULL,
  referencia_id  VARCHAR(100),
  -- Días contables (hora de Colombia). vigente_hasta es inclusive; NULL = abierta.
  vigente_desde  DATE          NOT NULL,
  vigente_hasta  DATE,
  creado_por     VARCHAR(100)  NOT NULL,
  creado_en      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_configuracion_comision_porcentaje CHECK (porcentaje BETWEEN 0 AND 100),
  CONSTRAINT ck_configuracion_comision_alcance
    CHECK (alcance IN ('GLOBAL', 'VENDEDOR', 'CATEGORIA')),
  CONSTRAINT ck_configuracion_comision_referencia CHECK (
    (alcance = 'GLOBAL' AND referencia_id IS NULL)
    OR (alcance <> 'GLOBAL' AND referencia_id IS NOT NULL)
  ),
  CONSTRAINT ck_configuracion_comision_vigencia
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  -- Segunda barrera contra vigencias solapadas del mismo alcance/referencia
  -- (la primera es la regla del dominio). Violación -> 23P01 -> HTTP 409.
  CONSTRAINT ex_configuracion_comision_solapada EXCLUDE USING gist (
    alcance WITH =,
    (COALESCE(referencia_id, '')) WITH =,
    daterange(vigente_desde, vigente_hasta, '[]') WITH &&
  )
);

-- Una sola vigencia abierta por alcance/referencia (es la que se bloquea con FOR UPDATE).
CREATE UNIQUE INDEX uq_configuracion_comision_abierta
  ON contabilidad.configuracion_comision (alcance, (COALESCE(referencia_id, '')))
  WHERE vigente_hasta IS NULL;
