-- HU-CON-10: pagos realizados a los vendedores (D-06, confirmada 2026-11-06).
-- Cada pago descuenta primero el saldo a favor del marketplace (ajuste_contable.saldo_a_favor)
-- y se aplica FIFO por periodo a las cuentas pendientes; pago_vendedor_detalle guarda qué
-- parte fue a cada cuenta.

-- Nuevo estado PARCIAL: la cuenta tiene pagos pero aún queda saldo.
ALTER TABLE contabilidad.cuenta_por_pagar DROP CONSTRAINT ck_cuenta_por_pagar_estado;
ALTER TABLE contabilidad.cuenta_por_pagar
  ADD CONSTRAINT ck_cuenta_por_pagar_estado CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADO'));
UPDATE contabilidad.cuenta_por_pagar
   SET estado = 'PARCIAL'
 WHERE valor_pagado > 0 AND valor_pagado < total_neto;

CREATE TABLE contabilidad.pago_vendedor (
  id                     UUID          PRIMARY KEY,
  vendedor_id            VARCHAR(64)   NOT NULL,
  fecha                  TIMESTAMPTZ   NOT NULL,
  fecha_contable         DATE          NOT NULL,
  -- Valor transferido al vendedor.
  valor                  NUMERIC(18,2) NOT NULL,
  -- Saldo a favor del marketplace descontado con este pago (D-07).
  saldo_a_favor_aplicado NUMERIC(18,2) NOT NULL DEFAULT 0,
  referencia             VARCHAR(100)  NOT NULL,
  soporte                VARCHAR(500),
  registrado_por         VARCHAR(100)  NOT NULL,
  registrado_en          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_pago_vendedor_referencia UNIQUE (vendedor_id, referencia),
  CONSTRAINT ck_pago_vendedor_valores CHECK (valor > 0 AND saldo_a_favor_aplicado >= 0)
);
CREATE INDEX ix_pago_vendedor_consulta
  ON contabilidad.pago_vendedor (vendedor_id, fecha_contable);
CREATE INDEX ix_pago_vendedor_fecha ON contabilidad.pago_vendedor (fecha_contable);

CREATE TABLE contabilidad.pago_vendedor_detalle (
  pago_id         UUID          NOT NULL REFERENCES contabilidad.pago_vendedor (id),
  periodo         VARCHAR(10)   NOT NULL,
  valor_aplicado  NUMERIC(18,2) NOT NULL,
  saldo_anterior  NUMERIC(18,2) NOT NULL,
  saldo_nuevo     NUMERIC(18,2) NOT NULL,
  estado          VARCHAR(16)   NOT NULL,
  CONSTRAINT pk_pago_vendedor_detalle PRIMARY KEY (pago_id, periodo),
  CONSTRAINT ck_pago_vendedor_detalle_valores
    CHECK (valor_aplicado > 0 AND saldo_nuevo >= 0 AND saldo_anterior = valor_aplicado + saldo_nuevo),
  CONSTRAINT ck_pago_vendedor_detalle_estado CHECK (estado IN ('PARCIAL', 'PAGADO'))
);
