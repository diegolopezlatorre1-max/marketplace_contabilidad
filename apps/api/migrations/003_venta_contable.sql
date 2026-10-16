-- HU-CON-01: ventas registradas contablemente, una por (orden, vendedor) (D-05).
-- Inmutables: las correcciones se registran como ajustes (HU-CON-06).

CREATE TABLE contabilidad.venta_contable (
  id              UUID          PRIMARY KEY,
  event_id        VARCHAR(100)  NOT NULL,
  numero_orden    VARCHAR(64)   NOT NULL,
  vendedor_id     VARCHAR(64)   NOT NULL,
  categoria_id    VARCHAR(64),
  -- Instante de la orden; día y quincena se calculan en hora de Colombia (D-03).
  fecha           TIMESTAMPTZ   NOT NULL,
  fecha_contable  DATE          NOT NULL,
  periodo         VARCHAR(10)   NOT NULL,
  valor_bruto     NUMERIC(18,2) NOT NULL,
  moneda          CHAR(3)       NOT NULL DEFAULT 'COP',
  estado_origen   VARCHAR(32)   NOT NULL,
  registrado_en   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_venta_contable_valor_bruto CHECK (valor_bruto > 0),
  -- Segunda barrera de idempotencia (supuesto S-03), además del inbox.
  CONSTRAINT uq_venta_contable_orden_vendedor UNIQUE (numero_orden, vendedor_id)
);
CREATE INDEX ix_venta_contable_fecha ON contabilidad.venta_contable (fecha_contable);
CREATE INDEX ix_venta_contable_vendedor ON contabilidad.venta_contable (vendedor_id, fecha_contable);
CREATE INDEX ix_venta_contable_vendedor_periodo ON contabilidad.venta_contable (vendedor_id, periodo);
