import type { CuentaPorPagarRepository } from '../../../application/ports/out/CuentaPorPagarRepository';
import { CuentaPorPagar } from '../../../domain/cuentaPorPagar/cuentaPorPagar';
import { Money, type Periodo } from '../../../domain/shared';
import type { Queryable } from './pool';

export class PgCuentaPorPagarRepository implements CuentaPorPagarRepository {
  constructor(private readonly db: Queryable) {}

  async obtenerParaActualizar(vendedorId: string, periodo: Periodo): Promise<CuentaPorPagar> {
    await this.db.query(
      `INSERT INTO contabilidad.cuenta_por_pagar (vendedor_id, periodo) VALUES ($1, $2)
       ON CONFLICT (vendedor_id, periodo) DO NOTHING`,
      [vendedorId, periodo.codigo],
    );
    const cuenta = await this.db.query<{ total_neto: string; valor_pagado: string }>(
      `SELECT total_neto, valor_pagado FROM contabilidad.cuenta_por_pagar
        WHERE vendedor_id = $1 AND periodo = $2
        FOR UPDATE`,
      [vendedorId, periodo.codigo],
    );
    const fila = cuenta.rows[0];
    if (!fila) throw new Error(`Cuenta por pagar no encontrada: ${vendedorId} ${periodo.codigo}`);
    // Las órdenes de la cuenta son las ventas del vendedor en el periodo.
    const ordenes = await this.db.query<{ numero_orden: string }>(
      `SELECT numero_orden FROM contabilidad.venta_contable WHERE vendedor_id = $1 AND periodo = $2`,
      [vendedorId, periodo.codigo],
    );
    return CuentaPorPagar.reconstituir({
      vendedorId,
      periodo,
      totalNeto: Money.of(fila.total_neto),
      pagado: Money.of(fila.valor_pagado),
      ordenes: ordenes.rows.map((r) => r.numero_orden),
    });
  }

  async guardar(c: CuentaPorPagar): Promise<void> {
    await this.db.query(
      `UPDATE contabilidad.cuenta_por_pagar
          SET total_neto = $3, valor_pagado = $4, estado = $5, actualizado_en = now()
        WHERE vendedor_id = $1 AND periodo = $2`,
      [
        c.vendedorId,
        c.periodo.codigo,
        c.valorTotalNeto.toString(),
        c.valorPagado.toString(),
        c.estado,
      ],
    );
  }
}
