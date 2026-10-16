import type {
  EstadoPagoRecibido,
  FiltroPagosRecibidos,
  PagoRecibidoRepository,
  PagoRecibidoResumen,
} from '../../../application/ports/out/PagoRecibidoRepository';
import { PagoRecibido, type OrigenPago } from '../../../domain/conciliacion/PagoRecibido';
import { Money } from '../../../domain/shared';
import type { Queryable } from './pool';

interface Fila {
  id: string;
  referencia_pasarela: string;
  event_id: string | null;
  fecha: Date;
  fecha_contable: string;
  valor: string;
  origen: OrigenPago;
  ordenes_informadas: string[];
}

const COLUMNAS = `p.id, p.referencia_pasarela, p.event_id, p.fecha, p.fecha_contable, p.valor,
                  p.origen, p.ordenes_informadas`;

const CONDICION_ESTADO: Record<EstadoPagoRecibido, string> = {
  SIN_CONCILIAR: 'c.id IS NULL',
  CONCILIADO: "c.estado = 'CONCILIADA'",
  PENDIENTE: "c.estado = 'PENDIENTE'",
};

function aDominio(f: Fila): PagoRecibido {
  return PagoRecibido.registrar({
    id: f.id,
    referenciaPasarela: f.referencia_pasarela,
    fecha: f.fecha,
    valor: Money.of(f.valor),
    origen: f.origen,
    eventId: f.event_id,
    ordenesInformadas: f.ordenes_informadas,
  });
}

export class PgPagoRecibidoRepository implements PagoRecibidoRepository {
  constructor(private readonly db: Queryable) {}

  async existeReferencia(referenciaPasarela: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `SELECT 1 FROM contabilidad.pago_recibido WHERE referencia_pasarela = $1`,
      [referenciaPasarela],
    );
    return (rowCount ?? 0) > 0;
  }

  async guardar(p: PagoRecibido, registradoPor: string): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.pago_recibido
         (id, referencia_pasarela, event_id, fecha, fecha_contable, valor, origen,
          ordenes_informadas, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        p.id,
        p.referenciaPasarela,
        p.eventId,
        p.fecha,
        p.fechaContable,
        p.valor.toString(),
        p.origen,
        JSON.stringify(p.ordenesInformadas),
        registradoPor,
      ],
    );
  }

  async obtenerParaConciliar(id: string): Promise<PagoRecibido | null> {
    const { rows } = await this.db.query<Fila>(
      `SELECT ${COLUMNAS} FROM contabilidad.pago_recibido p WHERE p.id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ? aDominio(rows[0]) : null;
  }

  async listar(filtro: FiltroPagosRecibidos): Promise<PagoRecibidoResumen[]> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    const agregar = (columnaYOperador: string, valor: unknown) => {
      params.push(valor);
      condiciones.push(`${columnaYOperador} $${params.length}`);
    };
    if (filtro.desde) agregar('p.fecha_contable >=', filtro.desde);
    if (filtro.hasta) agregar('p.fecha_contable <=', filtro.hasta);
    if (filtro.estado) condiciones.push(CONDICION_ESTADO[filtro.estado]);
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const { rows } = await this.db.query<
      Fila & { conciliacion_id: string | null; estado: string | null; diferencia: string | null }
    >(
      `SELECT ${COLUMNAS}, c.id AS conciliacion_id, c.estado, c.diferencia
         FROM contabilidad.pago_recibido p
         LEFT JOIN contabilidad.conciliacion c ON c.pago_recibido_id = p.id
         ${where}
        ORDER BY p.fecha DESC, p.referencia_pasarela`,
      params,
    );
    return rows.map((f) => ({
      id: f.id,
      referenciaPasarela: f.referencia_pasarela,
      fecha: f.fecha.toISOString(),
      fechaContable: f.fecha_contable,
      valor: f.valor,
      origen: f.origen,
      ordenesInformadas: f.ordenes_informadas,
      estado: !f.conciliacion_id
        ? 'SIN_CONCILIAR'
        : f.estado === 'CONCILIADA'
          ? 'CONCILIADO'
          : 'PENDIENTE',
      conciliacionId: f.conciliacion_id,
      diferencia: f.diferencia,
    }));
  }
}
