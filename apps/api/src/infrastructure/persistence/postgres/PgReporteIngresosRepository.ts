import type {
  FilaDiaReporte,
  FiltroReporteIngresos,
  ReporteIngresosRepository,
} from '../../../application/ports/out/ReporteIngresosRepository';
import type { Queryable } from './pool';

interface Fila {
  fecha: string;
  cantidad: number;
  valor_bruto: string;
  comision: string;
  valor_neto: string;
}

const aFila = (f: Fila): FilaDiaReporte => ({
  fecha: f.fecha,
  cantidad: f.cantidad,
  valorBruto: f.valor_bruto,
  comision: f.comision,
  valorNeto: f.valor_neto,
});

/**
 * HU-CON-05: los límites y la agrupación usan fecha_contable (DATE), que se calculó en
 * hora de Colombia al registrar; nunca el instante en UTC. Usa los índices por fecha
 * de venta_contable y ajuste_contable.
 */
export class PgReporteIngresosRepository implements ReporteIngresosRepository {
  constructor(private readonly db: Queryable) {}

  async movimientosPorDia(filtro: FiltroReporteIngresos) {
    const params: unknown[] = [filtro.desde, filtro.hasta];
    if (filtro.vendedorId) params.push(filtro.vendedorId);
    const porVendedor = filtro.vendedorId ? 'AND v.vendedor_id = $3' : '';

    const ventas = await this.db.query<Fila>(
      `SELECT v.fecha_contable AS fecha, count(*)::int AS cantidad,
              sum(v.valor_bruto) AS valor_bruto, sum(c.valor_comision) AS comision,
              sum(c.valor_neto) AS valor_neto
         FROM contabilidad.venta_contable v
         JOIN contabilidad.comision c ON c.venta_id = v.id
        WHERE v.fecha_contable BETWEEN $1 AND $2 ${porVendedor}
        GROUP BY v.fecha_contable
        ORDER BY v.fecha_contable`,
      params,
    );
    // Los ajustes se ubican por SU fecha, aunque la venta sea de otro día o de otro rango.
    const ajustes = await this.db.query<Fila>(
      `SELECT a.fecha_contable AS fecha, count(*)::int AS cantidad,
              sum(a.valor) AS valor_bruto, sum(a.comision_revertida) AS comision,
              sum(a.neto_revertido) AS valor_neto
         FROM contabilidad.ajuste_contable a
         JOIN contabilidad.venta_contable v ON v.id = a.venta_id
        WHERE a.fecha_contable BETWEEN $1 AND $2 ${porVendedor}
        GROUP BY a.fecha_contable
        ORDER BY a.fecha_contable`,
      params,
    );
    return { ventas: ventas.rows.map(aFila), ajustes: ajustes.rows.map(aFila) };
  }
}
