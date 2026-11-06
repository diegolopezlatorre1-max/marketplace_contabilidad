import type {
  AjusteExportado,
  ExportacionRepository,
  FiltroExportacion,
  VentaExportada,
} from '../../../application/ports/out/ExportacionRepository';
import type { Queryable } from './pool';

/**
 * HU-CON-08: filas de la exportación a Excel. Usa los mismos filtros que el reporte de ingresos
 * (PgReporteIngresosRepository): ventas por su fecha contable y ajustes por la fecha del ajuste.
 */
export class PgExportacionRepository implements ExportacionRepository {
  constructor(private readonly db: Queryable) {}

  async ventas(filtro: FiltroExportacion): Promise<VentaExportada[]> {
    const params: unknown[] = [filtro.desde, filtro.hasta];
    if (filtro.vendedorId) params.push(filtro.vendedorId);
    const { rows } = await this.db.query<{
      fecha_contable: string;
      numero_orden: string;
      vendedor_id: string;
      valor_bruto: string;
      porcentaje_aplicado: string;
      comision: string;
      valor_neto: string;
      estado_pago: VentaExportada['estadoPago'];
      estado_conciliacion: VentaExportada['estadoConciliacion'];
      ajustes: string;
    }>(
      `SELECT v.fecha_contable, v.numero_orden, v.vendedor_id, v.valor_bruto,
              c.porcentaje_aplicado, c.valor_comision AS comision, c.valor_neto,
              coalesce(cp.estado, 'PENDIENTE') AS estado_pago,
              CASE WHEN coalesce(con.aplicado, 0) >= o.valor_orden THEN 'CONCILIADA'
                   WHEN coalesce(con.aplicado, 0) > 0 THEN 'PARCIAL'
                   ELSE 'SIN_CONCILIAR' END AS estado_conciliacion,
              coalesce(aj.valor, 0) AS ajustes
         FROM contabilidad.venta_contable v
         JOIN contabilidad.comision c ON c.venta_id = v.id
         LEFT JOIN contabilidad.cuenta_por_pagar cp
           ON cp.vendedor_id = v.vendedor_id AND cp.periodo = v.periodo
         -- El valor de una orden es la suma de sus ventas (HU-CON-04).
         LEFT JOIN LATERAL (
           SELECT sum(o.valor_bruto) AS valor_orden
             FROM contabilidad.venta_contable o WHERE o.numero_orden = v.numero_orden
         ) o ON true
         LEFT JOIN LATERAL (
           SELECT sum(cd.valor_aplicado) AS aplicado
             FROM contabilidad.conciliacion_detalle cd WHERE cd.numero_orden = v.numero_orden
         ) con ON true
         LEFT JOIN LATERAL (
           SELECT sum(a.valor) AS valor
             FROM contabilidad.ajuste_contable a
            WHERE a.venta_id = v.id AND a.fecha_contable <= $2
         ) aj ON true
        WHERE v.fecha_contable BETWEEN $1 AND $2 ${filtro.vendedorId ? 'AND v.vendedor_id = $3' : ''}
        ORDER BY v.fecha_contable, v.numero_orden, v.vendedor_id`,
      params,
    );
    return rows.map((f) => ({
      fechaContable: f.fecha_contable,
      numeroOrden: f.numero_orden,
      vendedorId: f.vendedor_id,
      valorBruto: f.valor_bruto,
      porcentajeAplicado: f.porcentaje_aplicado,
      comision: f.comision,
      valorNeto: f.valor_neto,
      estadoPago: f.estado_pago,
      estadoConciliacion: f.estado_conciliacion,
      ajustes: f.ajustes,
    }));
  }

  async ajustes(filtro: FiltroExportacion): Promise<AjusteExportado[]> {
    const params: unknown[] = [filtro.desde, filtro.hasta];
    if (filtro.vendedorId) params.push(filtro.vendedorId);
    const { rows } = await this.db.query<{
      fecha_contable: string;
      numero_orden: string;
      vendedor_id: string;
      tipo: AjusteExportado['tipo'];
      motivo: string;
      valor: string;
      comision_revertida: string;
      neto_revertido: string;
    }>(
      `SELECT a.fecha_contable, v.numero_orden, v.vendedor_id, a.tipo, a.motivo, a.valor,
              a.comision_revertida, a.neto_revertido
         FROM contabilidad.ajuste_contable a
         JOIN contabilidad.venta_contable v ON v.id = a.venta_id
        WHERE a.fecha_contable BETWEEN $1 AND $2 ${filtro.vendedorId ? 'AND v.vendedor_id = $3' : ''}
        ORDER BY a.fecha_contable, a.fecha, v.numero_orden`,
      params,
    );
    return rows.map((f) => ({
      fechaContable: f.fecha_contable,
      numeroOrden: f.numero_orden,
      vendedorId: f.vendedor_id,
      tipo: f.tipo,
      motivo: f.motivo,
      valor: f.valor,
      comisionRevertida: f.comision_revertida,
      netoRevertido: f.neto_revertido,
    }));
  }
}
