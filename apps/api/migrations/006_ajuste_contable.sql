-- HU-CON-06: ajustes por devolución o cancelación (D-07, provisional).
-- La venta original nunca se modifica: cada ajuste revierte parte de su comisión y neto.
-- fecha_contable / periodo son los del ajuste (el reporte de HU-CON-05 usa la fecha del ajuste).

CREATE TABLE contabilidad.ajuste_contable (
  id                   UUID          PRIMARY KEY,
  venta_id             UUID          NOT NULL REFERENCES contabilidad.venta_contable (id),
  tipo                 VARCHAR(16)   NOT NULL,
  motivo               VARCHAR(500)  NOT NULL,
  fecha                TIMESTAMPTZ   NOT NULL,
  fecha_contable       DATE          NOT NULL,
  periodo              VARCHAR(10)   NOT NULL,
  valor                NUMERIC(18,2) NOT NULL,
  porcentaje_aplicado  NUMERIC(7,4)  NOT NULL,
  comision_revertida   NUMERIC(18,2) NOT NULL,
  neto_revertido       NUMERIC(18,2) NOT NULL,
  -- Parte del neto revertido que ya se había pagado al vendedor (D-07).
  saldo_a_favor        NUMERIC(18,2) NOT NULL DEFAULT 0,
  origen               VARCHAR(16)   NOT NULL,
  event_id             VARCHAR(100),
  registrado_por       VARCHAR(100)  NOT NULL,
  registrado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_ajuste_tipo CHECK (tipo IN ('DEVOLUCION', 'CANCELACION')),
  CONSTRAINT ck_ajuste_origen CHECK (origen IN ('MANUAL', 'EVENTO')),
  CONSTRAINT ck_ajuste_valores
    CHECK (valor > 0 AND comision_revertida >= 0 AND neto_revertido >= 0),
  -- Mismo invariante que la comisión (D-02): valor = comisión revertida + neto revertido.
  CONSTRAINT ck_ajuste_cuadre CHECK (valor = comision_revertida + neto_revertido),
  CONSTRAINT ck_ajuste_saldo_a_favor
    CHECK (saldo_a_favor >= 0 AND saldo_a_favor <= neto_revertido)
);
CREATE INDEX ix_ajuste_contable_venta ON contabilidad.ajuste_contable (venta_id);
CREATE INDEX ix_ajuste_contable_fecha ON contabilidad.ajuste_contable (fecha_contable);
