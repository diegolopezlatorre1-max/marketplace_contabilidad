-- HU-CON-03: saldo a pagar a cada vendedor por quincena (D-03).
-- Las ventas que la componen se obtienen de venta_contable (vendedor + periodo).

CREATE TABLE contabilidad.cuenta_por_pagar (
  id              BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendedor_id     VARCHAR(64)   NOT NULL,
  periodo         VARCHAR(10)   NOT NULL,
  total_neto      NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_pagado    NUMERIC(18,2) NOT NULL DEFAULT 0,
  estado          VARCHAR(16)   NOT NULL DEFAULT 'PENDIENTE',
  actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_cuenta_por_pagar_vendedor_periodo UNIQUE (vendedor_id, periodo),
  CONSTRAINT ck_cuenta_por_pagar_estado CHECK (estado IN ('PENDIENTE', 'PAGADO')),
  CONSTRAINT ck_cuenta_por_pagar_valores
    CHECK (total_neto >= 0 AND valor_pagado >= 0 AND valor_pagado <= total_neto)
);
CREATE INDEX ix_cuenta_por_pagar_consulta
  ON contabilidad.cuenta_por_pagar (vendedor_id, periodo, estado);
CREATE INDEX ix_cuenta_por_pagar_periodo_estado
  ON contabilidad.cuenta_por_pagar (periodo, estado);
