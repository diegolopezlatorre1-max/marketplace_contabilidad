import type {
  CuentaPorPagarRepository,
  CuentaPorPagarResumen,
  EstadoCuentaPorPagar,
  FiltroCuentasPorPagar,
} from '../../../application/ports/out/CuentaPorPagarRepository';
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

  async listar(filtro: FiltroCuentasPorPagar): Promise<CuentaPorPagarResumen[]> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    const agregar = (columnaYOperador: string, valor: unknown) => {
      params.push(valor);
      condiciones.push(`${columnaYOperador} $${params.length}`);
    };
    if (filtro.periodo) agregar('periodo =', filtro.periodo);
    if (filtro.estado) agregar('estado =', filtro.estado);
    if (filtro.vendedorId) agregar('vendedor_id =', filtro.vendedorId);
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const { rows } = await this.db.query<{
      vendedor_id: string;
      periodo: string;
      total_neto: string;
      valor_pagado: string;
      saldo_pendiente: string;
      estado: EstadoCuentaPorPagar;
    }>(
      `SELECT vendedor_id, periodo, total_neto, valor_pagado,
              (total_neto - valor_pagado) AS saldo_pendiente, estado
         FROM contabilidad.cuenta_por_pagar
         ${where}
        ORDER BY periodo DESC, vendedor_id`,
      params,
    );
    return rows.map((f) => ({
      vendedorId: f.vendedor_id,
      periodo: f.periodo,
      totalNeto: f.total_neto,
      valorPagado: f.valor_pagado,
      saldoPendiente: f.saldo_pendiente,
      estado: f.estado,
    }));
  }
}
