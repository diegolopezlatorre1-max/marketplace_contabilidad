import type {
  AjusteContableRepository,
  AjusteRegistrado,
  FiltroAjustes,
  PaginaAjustes,
} from '../../../application/ports/out/AjusteContableRepository';
import type { AjusteContable, AjustesPrevios } from '../../../domain/ajuste/AjusteContable';
import { Money } from '../../../domain/shared';
import type { Queryable } from './pool';

interface Fila {
  id: string;
  venta_id: string;
  numero_orden: string;
  vendedor_id: string;
  tipo: AjusteRegistrado['tipo'];
  motivo: string;
  fecha: Date;
  fecha_contable: string;
  periodo: string;
  valor: string;
  porcentaje_aplicado: string;
  comision_revertida: string;
  neto_revertido: string;
  saldo_a_favor: string;
  origen: AjusteRegistrado['origen'];
  registrado_por: string;
  registrado_en: Date;
}

function aRegistrado(f: Fila): AjusteRegistrado {
  return {
    id: f.id,
    ventaId: f.venta_id,
    numeroOrden: f.numero_orden,
    vendedorId: f.vendedor_id,
    tipo: f.tipo,
    motivo: f.motivo,
    fecha: f.fecha.toISOString(),
    fechaContable: f.fecha_contable,
    periodo: f.periodo,
    valor: f.valor,
    porcentajeAplicado: f.porcentaje_aplicado,
    comisionRevertida: f.comision_revertida,
    netoRevertido: f.neto_revertido,
    saldoAFavor: f.saldo_a_favor,
    origen: f.origen,
    registradoPor: f.registrado_por,
    registradoEn: f.registrado_en.toISOString(),
  };
}

export class PgAjusteContableRepository implements AjusteContableRepository {
  constructor(private readonly db: Queryable) {}

  async guardar(a: AjusteContable, registradoEn: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.ajuste_contable
         (id, venta_id, tipo, motivo, fecha, fecha_contable, periodo, valor, porcentaje_aplicado,
          comision_revertida, neto_revertido, saldo_a_favor, origen, event_id, registrado_por,
          registrado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        a.id,
        a.ventaId,
        a.tipo,
        a.motivo,
        a.fecha,
        a.fechaContable,
        a.periodo.codigo,
        a.valor.toString(),
        a.porcentajeAplicado.toString(),
        a.comisionRevertida.toString(),
        a.netoRevertido.toString(),
        a.saldoAFavor.toString(),
        a.origen,
        a.eventId,
        a.registradoPor,
        registradoEn,
      ],
    );
  }

  async previosDeVenta(ventaId: string): Promise<AjustesPrevios> {
    const { rows } = await this.db.query<{ valor: string; comision: string; neto: string }>(
      `SELECT coalesce(sum(valor), 0) AS valor,
              coalesce(sum(comision_revertida), 0) AS comision,
              coalesce(sum(neto_revertido), 0) AS neto
         FROM contabilidad.ajuste_contable WHERE venta_id = $1`,
      [ventaId],
    );
    const f = rows[0]!;
    return { valor: Money.of(f.valor), comision: Money.of(f.comision), neto: Money.of(f.neto) };
  }

  async listar(filtro: FiltroAjustes): Promise<PaginaAjustes> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    const agregar = (columnaYOperador: string, valor: unknown) => {
      params.push(valor);
      condiciones.push(`${columnaYOperador} $${params.length}`);
    };
    if (filtro.ventaId) agregar('a.venta_id =', filtro.ventaId);
    if (filtro.vendedorId) agregar('v.vendedor_id =', filtro.vendedorId);
    if (filtro.desde) agregar('a.fecha_contable >=', filtro.desde);
    if (filtro.hasta) agregar('a.fecha_contable <=', filtro.hasta);
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const desde = `FROM contabilidad.ajuste_contable a
      JOIN contabilidad.venta_contable v ON v.id = a.venta_id`;

    const total = await this.db.query<{ total: string }>(
      `SELECT count(*) AS total ${desde} ${where}`,
      params,
    );
    const { rows } = await this.db.query<Fila>(
      `SELECT a.id, a.venta_id, v.numero_orden, v.vendedor_id, a.tipo, a.motivo, a.fecha,
              a.fecha_contable, a.periodo, a.valor, a.porcentaje_aplicado, a.comision_revertida,
              a.neto_revertido, a.saldo_a_favor, a.origen, a.registrado_por, a.registrado_en
         ${desde}
         ${where}
        ORDER BY a.fecha DESC, a.registrado_en DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtro.size, (filtro.page - 1) * filtro.size],
    );
    return {
      items: rows.map(aRegistrado),
      page: filtro.page,
      size: filtro.size,
      total: Number(total.rows[0]?.total ?? 0),
    };
  }
}
