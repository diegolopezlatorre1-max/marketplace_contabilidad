import type {
  FiltroVentas,
  PaginaVentas,
  VentaContableRepository,
  VentaDetalle,
  VentaRegistrada,
} from '../../../application/ports/out/VentaContableRepository';
import type { VentaContable } from '../../../domain/venta/VentaContable';
import type { Queryable } from './pool';

interface Fila {
  id: string;
  numero_orden: string;
  vendedor_id: string;
  categoria_id: string | null;
  fecha: Date;
  fecha_contable: string;
  periodo: string;
  valor_bruto: string;
  porcentaje_aplicado: string | null;
  valor_comision: string | null;
  valor_neto: string | null;
}

function aVentaRegistrada(f: Fila): VentaRegistrada {
  return {
    id: f.id,
    numeroOrden: f.numero_orden,
    vendedorId: f.vendedor_id,
    categoriaId: f.categoria_id,
    fecha: f.fecha.toISOString(),
    fechaContable: f.fecha_contable,
    periodo: f.periodo,
    valorBruto: f.valor_bruto,
    porcentajeAplicado: f.porcentaje_aplicado,
    comision: f.valor_comision,
    valorNeto: f.valor_neto,
  };
}

const COLUMNAS = `v.id, v.numero_orden, v.vendedor_id, v.categoria_id, v.fecha, v.fecha_contable,
       v.periodo, v.valor_bruto, c.porcentaje_aplicado, c.valor_comision, c.valor_neto`;
const DESDE = `FROM contabilidad.venta_contable v
  LEFT JOIN contabilidad.comision c ON c.venta_id = v.id`;

export class PgVentaContableRepository implements VentaContableRepository {
  constructor(private readonly db: Queryable) {}

  async existe(numeroOrden: string, vendedorId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `SELECT 1 FROM contabilidad.venta_contable WHERE numero_orden = $1 AND vendedor_id = $2`,
      [numeroOrden, vendedorId],
    );
    return (rowCount ?? 0) > 0;
  }

  async guardar(v: VentaContable, eventId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.venta_contable
         (id, event_id, numero_orden, vendedor_id, categoria_id, fecha, fecha_contable,
          periodo, valor_bruto, estado_origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        v.id,
        eventId,
        v.numeroOrden,
        v.vendedorId,
        v.categoriaId,
        v.fecha,
        v.fechaContable,
        v.periodo.codigo,
        v.valorBruto.toString(),
        v.estadoOrigen,
      ],
    );
  }

  async listar(filtro: FiltroVentas): Promise<PaginaVentas> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    const agregar = (columnaYOperador: string, valor: unknown) => {
      params.push(valor);
      condiciones.push(`${columnaYOperador} $${params.length}`);
    };
    if (filtro.desde) agregar('v.fecha_contable >=', filtro.desde);
    if (filtro.hasta) agregar('v.fecha_contable <=', filtro.hasta);
    if (filtro.vendedorId) agregar('v.vendedor_id =', filtro.vendedorId);
    if (filtro.periodo) agregar('v.periodo =', filtro.periodo);
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const total = await this.db.query<{ total: string }>(
      `SELECT count(*) AS total FROM contabilidad.venta_contable v ${where}`,
      params,
    );
    const { rows } = await this.db.query<Fila>(
      `SELECT ${COLUMNAS}
         ${DESDE}
         ${where}
        ORDER BY v.fecha DESC, v.numero_orden, v.vendedor_id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtro.size, (filtro.page - 1) * filtro.size],
    );
    return {
      items: rows.map(aVentaRegistrada),
      page: filtro.page,
      size: filtro.size,
      total: Number(total.rows[0]?.total ?? 0),
    };
  }

  async obtener(id: string): Promise<VentaDetalle | null> {
    const { rows } = await this.db.query<Fila & { estado_origen: string; registrado_en: Date }>(
      `SELECT ${COLUMNAS}, v.estado_origen, v.registrado_en
         ${DESDE}
        WHERE v.id = $1`,
      [id],
    );
    const f = rows[0];
    if (!f) return null;
    return {
      ...aVentaRegistrada(f),
      estadoOrigen: f.estado_origen,
      registradoEn: f.registrado_en.toISOString(),
    };
  }

  async listarPeriodos(): Promise<string[]> {
    const { rows } = await this.db.query<{ periodo: string }>(
      `SELECT DISTINCT periodo FROM contabilidad.venta_contable ORDER BY periodo DESC`,
    );
    return rows.map((r) => r.periodo);
  }
}
