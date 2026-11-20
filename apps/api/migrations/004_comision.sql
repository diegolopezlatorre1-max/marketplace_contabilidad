-- HU-CON-02: comisión de cada venta con el porcentaje aplicado (snapshot).
-- Cambiar el % después (HU-CON-09) no altera las comisiones ya calculadas.

CREATE TABLE contabilidad.comision (
  id                   UUID          PRIMARY KEY,
  venta_id             UUID          NOT NULL REFERENCES contabilidad.venta_contable (id),
  porcentaje_aplicado  NUMERIC(7,4)  NOT NULL,
  valor_bruto          NUMERIC(18,2) NOT NULL,
  valor_comision       NUMERIC(18,2) NOT NULL,
  valor_neto           NUMERIC(18,2) NOT NULL,
  calculada_en         TIMESTAMPTZ   NOT NULL,
  CONSTRAINT uq_comision_venta UNIQUE (venta_id),
  CONSTRAINT ck_comision_porcentaje CHECK (porcentaje_aplicado BETWEEN 0 AND 100),
  CONSTRAINT ck_comision_valores CHECK (valor_comision >= 0 AND valor_neto >= 0),
  -- Invariante contable (D-02): bruto = comisión + neto.
  CONSTRAINT ck_comision_cuadre CHECK (valor_bruto = valor_comision + valor_neto)
);
