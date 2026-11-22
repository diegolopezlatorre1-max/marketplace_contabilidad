-- Escrow (GUIA_EQUIPO_6, sección 6): custodia del dinero de cada pedido.
--  - Módulo (servicio): POST /escrow/marcar-entrega/{pedido_id} → retención de 72 h desde la
--    entrega, que se libera sola al cumplirse (liberable_desde); y POST /escrow/bloquear ante PQR.
--  - ADMIN: POST /escrow/desbloquear/{pedido_id} → desbloqueo manual con motivo.
-- Solo el neto de pedidos LIBERADOS (entregados hace 72 h o más y sin bloqueo) se puede usar en
-- un pago a vendedor (HU-CON-10). Un pedido sin fila aquí todavía no se ha entregado y retiene el
-- pago. pedido_id = venta_contable.numero_orden.

CREATE TABLE contabilidad.escrow_pedido (
  pedido_id        VARCHAR(64)  PRIMARY KEY,
  entregado_en     TIMESTAMPTZ,
  -- entregado_en + 72 h; NULL mientras no haya entrega.
  liberable_desde  TIMESTAMPTZ,
  bloqueado        BOOLEAN      NOT NULL DEFAULT false,
  bloqueado_en     TIMESTAMPTZ,
  motivo_bloqueo   VARCHAR(500),
  actualizado_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_escrow_entrega
    CHECK ((entregado_en IS NULL) = (liberable_desde IS NULL)
           AND (liberable_desde IS NULL OR liberable_desde > entregado_en)),
  CONSTRAINT ck_escrow_bloqueo CHECK (bloqueado OR (bloqueado_en IS NULL AND motivo_bloqueo IS NULL))
);
-- El join con las ventas usa la PK (pedido_id) y uq_venta_contable_orden_vendedor
-- (numero_orden, vendedor_id): no hacen falta índices adicionales.

-- RLS como el resto del esquema (008_rls.sql); los privilegios por defecto ya excluyen a
-- anon/authenticated en Supabase.
ALTER TABLE contabilidad.escrow_pedido ENABLE ROW LEVEL SECURITY;
