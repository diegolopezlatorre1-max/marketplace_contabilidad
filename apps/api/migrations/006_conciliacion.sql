-- HU-CON-04: pagos recibidos de la pasarela y su conciliación contra órdenes.
-- El valor de una orden es la suma del valor bruto de sus ventas (venta_contable).

CREATE TABLE contabilidad.pago_recibido (
  id                    UUID          PRIMARY KEY,
  referencia_pasarela   VARCHAR(100)  NOT NULL,
  event_id              VARCHAR(100),
  fecha                 TIMESTAMPTZ   NOT NULL,
  fecha_contable        DATE          NOT NULL,
  valor                 NUMERIC(18,2) NOT NULL,
  moneda                CHAR(3)       NOT NULL DEFAULT 'COP',
  origen                VARCHAR(10)   NOT NULL,
  -- Órdenes que informó la pasarela (pueden no coincidir con las conciliadas).
  ordenes_informadas    JSONB         NOT NULL DEFAULT '[]',
  registrado_por        VARCHAR(100)  NOT NULL,
  creado_en             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_pago_recibido_referencia UNIQUE (referencia_pasarela),
  CONSTRAINT ck_pago_recibido_valor CHECK (valor > 0),
  CONSTRAINT ck_pago_recibido_origen CHECK (origen IN ('API', 'CSV', 'MANUAL'))
);
CREATE INDEX ix_pago_recibido_fecha ON contabilidad.pago_recibido (fecha_contable);

-- Una conciliación por pago (D-08: tolerancia 0 provisional).
CREATE TABLE contabilidad.conciliacion (
  id                UUID          PRIMARY KEY,
  pago_recibido_id  UUID          NOT NULL REFERENCES contabilidad.pago_recibido (id),
  valor_pago        NUMERIC(18,2) NOT NULL,
  valor_aplicado    NUMERIC(18,2) NOT NULL,
  diferencia        NUMERIC(18,2) NOT NULL,
  estado            VARCHAR(16)   NOT NULL,
  usuario           VARCHAR(100)  NOT NULL,
  fecha             TIMESTAMPTZ   NOT NULL,
  CONSTRAINT uq_conciliacion_pago UNIQUE (pago_recibido_id),
  CONSTRAINT ck_conciliacion_estado CHECK (estado IN ('CONCILIADA', 'PENDIENTE')),
  CONSTRAINT ck_conciliacion_diferencia CHECK (diferencia = valor_pago - valor_aplicado)
);
CREATE INDEX ix_conciliacion_estado_fecha ON contabilidad.conciliacion (estado, fecha);

CREATE TABLE contabilidad.conciliacion_detalle (
  id               BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conciliacion_id  UUID          NOT NULL REFERENCES contabilidad.conciliacion (id),
  numero_orden     VARCHAR(64)   NOT NULL,
  valor_orden      NUMERIC(18,2) NOT NULL,
  valor_aplicado   NUMERIC(18,2) NOT NULL,
  CONSTRAINT uq_conciliacion_detalle_orden UNIQUE (conciliacion_id, numero_orden),
  CONSTRAINT ck_conciliacion_detalle_valor
    CHECK (valor_aplicado > 0 AND valor_aplicado <= valor_orden)
);
-- Saldo por conciliar de una orden = valor de la orden - suma aplicada.
CREATE INDEX ix_conciliacion_detalle_orden ON contabilidad.conciliacion_detalle (numero_orden);
CREATE INDEX ix_venta_contable_numero_orden ON contabilidad.venta_contable (numero_orden);
