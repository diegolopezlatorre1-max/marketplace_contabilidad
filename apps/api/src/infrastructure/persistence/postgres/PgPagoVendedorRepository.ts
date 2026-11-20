import type {
  FiltroPagosVendedor,
  PagoVendedorRegistrado,
  PagoVendedorRepository,
  PaginaPagosVendedor,
} from '../../../application/ports/out/PagoVendedorRepository';
import type { PagoVendedor } from '../../../domain/pagoVendedor/PagoVendedor';
import { Money } from '../../../domain/shared';
import type { Queryable } from './pool';

interface Fila {
  id: string;
  vendedor_id: string;
  fecha: Date;
  fecha_contable: string;
  valor: string;
  saldo_a_favor_aplicado: string;
  referencia: string;
  soporte: string | null;
  registrado_por: string;
  registrado_en: Date;
}

interface FilaDetalle {
  pago_id: string;
  periodo: string;
  valor_aplicado: string;
  saldo_anterior: string;
  saldo_nuevo: string;
  estado: 'PARCIAL' | 'PAGADO';
}

export class PgPagoVendedorRepository implements PagoVendedorRepository {
  constructor(private readonly db: Queryable) {}

  async guardar(p: PagoVendedor, registradoEn: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.pago_vendedor
         (id, vendedor_id, fecha, fecha_contable, valor, saldo_a_favor_aplicado, referencia,
          soporte, registrado_por, registrado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        p.id,
        p.vendedorId,
        p.fecha,
        p.fechaContable,
        p.valor.toString(),
        p.saldoAFavorAplicado.toString(),
        p.referencia,
        p.soporte,
        p.registradoPor,
        registradoEn,
      ],
    );
    for (const a of p.aplicaciones) {
      await this.db.query(
        `INSERT INTO contabilidad.pago_vendedor_detalle
           (pago_id, periodo, valor_aplicado, saldo_anterior, saldo_nuevo, estado)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          p.id,
          a.periodo.codigo,
          a.valorAplicado.toString(),
          a.saldoAnterior.toString(),
          a.saldoNuevo.toString(),
          a.estado,
        ],
      );
    }
  }

  async existeReferencia(vendedorId: string, referencia: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT 1 FROM contabilidad.pago_vendedor WHERE vendedor_id = $1 AND referencia = $2`,
      [vendedorId, referencia],
    );
    return rows.length > 0;
  }

  async saldoAFavorDisponible(vendedorId: string): Promise<Money> {
    const { rows } = await this.db.query<{ disponible: string }>(
      `SELECT
         (SELECT coalesce(sum(a.saldo_a_favor), 0)
            FROM contabilidad.ajuste_contable a
            JOIN contabilidad.venta_contable v ON v.id = a.venta_id
           WHERE v.vendedor_id = $1)
       - (SELECT coalesce(sum(p.saldo_a_favor_aplicado), 0)
            FROM contabilidad.pago_vendedor p
           WHERE p.vendedor_id = $1) AS disponible`,
      [vendedorId],
    );
    return Money.of(rows[0]!.disponible);
  }

  async listar(filtro: FiltroPagosVendedor): Promise<PaginaPagosVendedor> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    const agregar = (columnaYOperador: string, valor: unknown) => {
      params.push(valor);
      condiciones.push(`${columnaYOperador} $${params.length}`);
    };
    if (filtro.vendedorId) agregar('vendedor_id =', filtro.vendedorId);
    if (filtro.desde) agregar('fecha_contable >=', filtro.desde);
    if (filtro.hasta) agregar('fecha_contable <=', filtro.hasta);
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const total = await this.db.query<{ total: string }>(
      `SELECT count(*) AS total FROM contabilidad.pago_vendedor ${where}`,
      params,
    );
    const { rows } = await this.db.query<Fila>(
      `SELECT id, vendedor_id, fecha, fecha_contable,
              valor, saldo_a_favor_aplicado, referencia, soporte, registrado_por, registrado_en
         FROM contabilidad.pago_vendedor
         ${where}
        ORDER BY fecha DESC, registrado_en DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtro.size, (filtro.page - 1) * filtro.size],
    );
    const detalle = rows.length
      ? await this.db.query<FilaDetalle>(
          `SELECT pago_id, periodo, valor_aplicado, saldo_anterior, saldo_nuevo, estado
             FROM contabilidad.pago_vendedor_detalle
            WHERE pago_id = ANY($1::uuid[])
            ORDER BY periodo`,
          [rows.map((r) => r.id)],
        )
      : { rows: [] as FilaDetalle[] };

    return {
      items: rows.map((f): PagoVendedorRegistrado => ({
        id: f.id,
        vendedorId: f.vendedor_id,
        fecha: f.fecha.toISOString(),
        fechaContable: f.fecha_contable,
        valor: f.valor,
        saldoAFavorAplicado: f.saldo_a_favor_aplicado,
        referencia: f.referencia,
        soporte: f.soporte,
        aplicaciones: detalle.rows
          .filter((d) => d.pago_id === f.id)
          .map((d) => ({
            periodo: d.periodo,
            valorAplicado: d.valor_aplicado,
            saldoAnterior: d.saldo_anterior,
            saldoNuevo: d.saldo_nuevo,
            estado: d.estado,
          })),
        registradoPor: f.registrado_por,
        registradoEn: f.registrado_en.toISOString(),
      })),
      page: filtro.page,
      size: filtro.size,
      total: Number(total.rows[0]?.total ?? 0),
    };
  }
}
