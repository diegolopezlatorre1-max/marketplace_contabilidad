import type { EscrowRepository } from '../../../application/ports/out/EscrowRepository';
import { EscrowPedido } from '../../../domain/escrow/EscrowPedido';
import { Money } from '../../../domain/shared';
import type { Queryable } from './pool';

interface FilaEscrow {
  pedido_id: string;
  entregado_en: Date | null;
  liberable_desde: Date | null;
  bloqueado: boolean;
  bloqueado_en: Date | null;
  motivo_bloqueo: string | null;
  actualizado_en: Date;
}

export class PgEscrowRepository implements EscrowRepository {
  constructor(private readonly db: Queryable) {}

  async obtener(pedidoId: string): Promise<EscrowPedido | null> {
    const { rows } = await this.db.query<FilaEscrow>(
      `SELECT pedido_id, entregado_en, liberable_desde, bloqueado, bloqueado_en, motivo_bloqueo,
              actualizado_en
         FROM contabilidad.escrow_pedido
        WHERE pedido_id = $1`,
      [pedidoId],
    );
    const f = rows[0];
    if (!f) return null;
    return EscrowPedido.reconstituir({
      pedidoId: f.pedido_id,
      entregadoEn: f.entregado_en,
      liberableDesde: f.liberable_desde,
      bloqueado: f.bloqueado,
      bloqueadoEn: f.bloqueado_en,
      motivoBloqueo: f.motivo_bloqueo,
      actualizadoEn: f.actualizado_en,
    });
  }

  async guardar(escrow: EscrowPedido): Promise<void> {
    const d = escrow.datos;
    await this.db.query(
      `INSERT INTO contabilidad.escrow_pedido
         (pedido_id, entregado_en, liberable_desde, bloqueado, bloqueado_en, motivo_bloqueo,
          actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (pedido_id) DO UPDATE
         SET entregado_en = EXCLUDED.entregado_en,
             liberable_desde = EXCLUDED.liberable_desde,
             bloqueado = EXCLUDED.bloqueado,
             bloqueado_en = EXCLUDED.bloqueado_en,
             motivo_bloqueo = EXCLUDED.motivo_bloqueo,
             actualizado_en = EXCLUDED.actualizado_en`,
      [
        d.pedidoId,
        d.entregadoEn,
        d.liberableDesde,
        d.bloqueado,
        d.bloqueadoEn,
        d.motivoBloqueo,
        d.actualizadoEn,
      ],
    );
  }

  async pedidosRetenidos(vendedorId: string, ahora: Date): Promise<Set<string>> {
    const { rows } = await this.db.query<{ numero_orden: string }>(
      `SELECT DISTINCT v.numero_orden
         FROM contabilidad.venta_contable v
         LEFT JOIN contabilidad.escrow_pedido e ON e.pedido_id = v.numero_orden
        WHERE v.vendedor_id = $1
          AND NOT (e.pedido_id IS NOT NULL
                   AND NOT e.bloqueado
                   AND e.liberable_desde IS NOT NULL
                   AND e.liberable_desde <= $2)`,
      [vendedorId, ahora],
    );
    return new Set(rows.map((r) => r.numero_orden));
  }

  async netoRetenidoPorPeriodo(vendedorId: string, ahora: Date): Promise<Map<string, Money>> {
    const { rows } = await this.db.query<{ periodo: string; retenido: string }>(
      `SELECT v.periodo,
              SUM(c.valor_neto - COALESCE(a.neto_revertido, 0)) AS retenido
         FROM contabilidad.venta_contable v
         JOIN contabilidad.comision c ON c.venta_id = v.id
         LEFT JOIN contabilidad.escrow_pedido e ON e.pedido_id = v.numero_orden
         LEFT JOIN (SELECT venta_id, SUM(neto_revertido) AS neto_revertido
                      FROM contabilidad.ajuste_contable
                     GROUP BY venta_id) a ON a.venta_id = v.id
        WHERE v.vendedor_id = $1
          -- Solo se paga lo LIBERADO: con registro, sin bloqueo y con las 72 h cumplidas.
          AND NOT (e.pedido_id IS NOT NULL
                   AND NOT e.bloqueado
                   AND e.liberable_desde IS NOT NULL
                   AND e.liberable_desde <= $2)
        GROUP BY v.periodo`,
      [vendedorId, ahora],
    );
    const resultado = new Map<string, Money>();
    for (const r of rows) {
      const valor = Money.of(r.retenido);
      if (valor.isPositive()) resultado.set(r.periodo, valor);
    }
    return resultado;
  }
}
