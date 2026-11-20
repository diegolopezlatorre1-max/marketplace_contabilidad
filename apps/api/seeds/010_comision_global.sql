-- HU-CON-09: comisión GLOBAL del 10 % vigente desde 2026-01-01.
-- Idempotente: solo se inserta si aún no hay ninguna configuración GLOBAL.
INSERT INTO contabilidad.configuracion_comision
  (id, porcentaje, alcance, referencia_id, vigente_desde, vigente_hasta, creado_por)
SELECT gen_random_uuid(), 10, 'GLOBAL', NULL, DATE '2026-01-01', NULL, 'seed'
WHERE NOT EXISTS (
  SELECT 1 FROM contabilidad.configuracion_comision WHERE alcance = 'GLOBAL'
);
