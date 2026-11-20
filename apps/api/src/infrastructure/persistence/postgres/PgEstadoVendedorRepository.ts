import type { EstadoVendedorRepository } from '../../../application/ports/out/EstadoVendedorRepository';
import type { EstadoCuenta } from '../../../domain/cuentaPorPagar/cuentaPorPagar';
import type { MovimientosPeriodo } from '../../../domain/cuentaPorPagar/EstadoVendedor';
import { Money } from '../../../domain/shared';
import type { Queryable } from './pool';

interface Fila {
  periodo: string;
  ventas: string;
  vendido: string;
  comision: string;
  ajustes_valor: string;
  ajustes_comision: string;
  ajustes_neto: string;
  saldo_a_favor: string;
  pagado: string;
  pendiente: string;
  estado: EstadoCuenta;
}

/**
 * HU-CON-07: una fila por cuenta por pagar (vendedor + quincena) con las ventas y los ajustes de
 * esa quincena. Los ajustes se agrupan por la quincena de la venta, que es la cuenta que afectan.
 */
export class PgEstadoVendedorRepository implements EstadoVendedorRepository {
  constructor(private readonly db: Queryable) {}

  async movimientosPorPeriodo(
    vendedorId: string,
    desde?: string,
    hasta?: string,
  ): Promise<MovimientosPeriodo[]> {
    const { rows } = await this.db.query<Fila>(
      `WITH ventas AS (
         SELECT v.periodo, count(*) AS ventas, sum(c.valor_bruto) AS vendido,
                sum(c.valor_comision) AS comision
           FROM contabilidad.venta_contable v
           JOIN contabilidad.comision c ON c.venta_id = v.id
          WHERE v.vendedor_id = $1
          GROUP BY v.periodo
       ), ajustes AS (
         SELECT v.periodo, sum(a.valor) AS valor, sum(a.comision_revertida) AS comision,
                sum(a.neto_revertido) AS neto, sum(a.saldo_a_favor) AS saldo_a_favor
           FROM contabilidad.ajuste_contable a
           JOIN contabilidad.venta_contable v ON v.id = a.venta_id
          WHERE v.vendedor_id = $1
          GROUP BY v.periodo
       )
       SELECT cp.periodo,
              coalesce(ve.ventas, 0) AS ventas,
              coalesce(ve.vendido, 0) AS vendido,
              coalesce(ve.comision, 0) AS comision,
              coalesce(aj.valor, 0) AS ajustes_valor,
              coalesce(aj.comision, 0) AS ajustes_comision,
              coalesce(aj.neto, 0) AS ajustes_neto,
              coalesce(aj.saldo_a_favor, 0) AS saldo_a_favor,
              cp.valor_pagado AS pagado,
              cp.total_neto - cp.valor_pagado AS pendiente,
              cp.estado
         FROM contabilidad.cuenta_por_pagar cp
         LEFT JOIN ventas ve ON ve.periodo = cp.periodo
         LEFT JOIN ajustes aj ON aj.periodo = cp.periodo
        WHERE cp.vendedor_id = $1
          AND ($2::text IS NULL OR cp.periodo >= $2)
          AND ($3::text IS NULL OR cp.periodo <= $3)
        ORDER BY cp.periodo`,
      [vendedorId, desde ?? null, hasta ?? null],
    );
    return rows.map((f) => ({
      periodo: f.periodo,
      ventas: Number(f.ventas),
      vendido: Money.of(f.vendido),
      comision: Money.of(f.comision),
      ajustes: {
        valor: Money.of(f.ajustes_valor),
        comisionRevertida: Money.of(f.ajustes_comision),
        netoRevertido: Money.of(f.ajustes_neto),
        saldoAFavor: Money.of(f.saldo_a_favor),
      },
      pagado: Money.of(f.pagado),
      pendiente: Money.of(f.pendiente),
      estado: f.estado,
    }));
  }
}
