import type {
  ConciliacionRepository,
  ConciliacionResumen,
  FiltroConciliaciones,
} from '../../../application/ports/out/ConciliacionRepository';
import type {
  Conciliacion,
  EstadoConciliacion,
  OrdenPorConciliar,
} from '../../../domain/conciliacion/Conciliacion';
import { Money } from '../../../domain/shared';
import type { Queryable } from './pool';

interface FilaResumen {
  id: string;
  pago_recibido_id: string;
  referencia_pasarela: string;
  fecha_pago: Date;
  valor_pago: string;
  valor_aplicado: string;
  diferencia: string;
  estado: EstadoConciliacion;
  usuario: string;
  fecha: Date;
  detalles: ConciliacionResumen['detalles'];
}

const SELECT_RESUMEN = `
  SELECT c.id, c.pago_recibido_id, p.referencia_pasarela, p.fecha AS fecha_pago,
         c.valor_pago, c.valor_aplicado, c.diferencia, c.estado, c.usuario, c.fecha,
         COALESCE(
           json_agg(json_build_object(
             'numeroOrden', d.numero_orden,
             'valorOrden', d.valor_orden::text,
             'valorAplicado', d.valor_aplicado::text
           ) ORDER BY d.numero_orden) FILTER (WHERE d.id IS NOT NULL),
           '[]'
         ) AS detalles
    FROM contabilidad.conciliacion c
    JOIN contabilidad.pago_recibido p ON p.id = c.pago_recibido_id
    LEFT JOIN contabilidad.conciliacion_detalle d ON d.conciliacion_id = c.id`;

function aResumen(f: FilaResumen): ConciliacionResumen {
  return {
    id: f.id,
    pagoId: f.pago_recibido_id,
    referenciaPasarela: f.referencia_pasarela,
    fechaPago: f.fecha_pago.toISOString(),
    valorPago: f.valor_pago,
    valorAplicado: f.valor_aplicado,
    diferencia: f.diferencia,
    estado: f.estado,
    usuario: f.usuario,
    fecha: f.fecha.toISOString(),
    detalles: f.detalles,
  };
}

export class PgConciliacionRepository implements ConciliacionRepository {
  constructor(private readonly db: Queryable) {}

  async existeParaPago(pagoId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `SELECT 1 FROM contabilidad.conciliacion WHERE pago_recibido_id = $1`,
      [pagoId],
    );
    return (rowCount ?? 0) > 0;
  }

  async ordenesPorConciliar(numerosOrden: readonly string[]): Promise<OrdenPorConciliar[]> {
    if (numerosOrden.length === 0) return [];
    const { rows } = await this.db.query<{
      numero_orden: string;
      valor_orden: string;
      valor_ya_aplicado: string;
    }>(
      `SELECT v.numero_orden,
              sum(v.valor_bruto) AS valor_orden,
              COALESCE((SELECT sum(d.valor_aplicado)
                          FROM contabilidad.conciliacion_detalle d
                         WHERE d.numero_orden = v.numero_orden), 0) AS valor_ya_aplicado
         FROM contabilidad.venta_contable v
        WHERE v.numero_orden = ANY($1)
        GROUP BY v.numero_orden`,
      [[...numerosOrden]],
    );
    return rows.map((r) => ({
      numeroOrden: r.numero_orden,
      valorOrden: Money.of(r.valor_orden),
      valorYaAplicado: Money.of(r.valor_ya_aplicado),
    }));
  }

  async guardar(c: Conciliacion): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.conciliacion
         (id, pago_recibido_id, valor_pago, valor_aplicado, diferencia, estado, usuario, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        c.id,
        c.pago.id,
        c.pago.valor.toString(),
        c.valorAplicado.toString(),
        c.diferencia.toString(),
        c.estado,
        c.usuario,
        c.fecha,
      ],
    );
    for (const d of c.detalles) {
      await this.db.query(
        `INSERT INTO contabilidad.conciliacion_detalle
           (conciliacion_id, numero_orden, valor_orden, valor_aplicado)
         VALUES ($1, $2, $3, $4)`,
        [c.id, d.numeroOrden, d.valorOrden.toString(), d.valorAplicado.toString()],
      );
    }
  }

  async listar(filtro: FiltroConciliaciones): Promise<ConciliacionResumen[]> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    const agregar = (columnaYOperador: string, valor: unknown) => {
      params.push(valor);
      condiciones.push(`${columnaYOperador} $${params.length}`);
    };
    if (filtro.estado) agregar('c.estado =', filtro.estado);
    if (filtro.desde) agregar('p.fecha_contable >=', filtro.desde);
    if (filtro.hasta) agregar('p.fecha_contable <=', filtro.hasta);
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await this.db.query<FilaResumen>(
      `${SELECT_RESUMEN} ${where} GROUP BY c.id, p.id ORDER BY c.fecha DESC`,
      params,
    );
    return rows.map(aResumen);
  }

  async obtener(id: string): Promise<ConciliacionResumen | null> {
    const { rows } = await this.db.query<FilaResumen>(
      `${SELECT_RESUMEN} WHERE c.id = $1 GROUP BY c.id, p.id`,
      [id],
    );
    return rows[0] ? aResumen(rows[0]) : null;
  }
}
