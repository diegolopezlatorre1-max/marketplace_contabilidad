import type {
  AuditoriaRepository,
  FiltroAuditoria,
  PaginaAuditoria,
} from '../../../application/ports/out/AuditoriaRepository';
import { ZONA_HORARIA_CONTABLE } from '../../../domain/shared';
import type { Queryable } from './pool';

interface Fila {
  id: string;
  entidad: string;
  entidad_id: string;
  accion: string;
  usuario: string;
  fecha: Date;
  valores_anteriores: unknown;
  valores_nuevos: unknown;
  correlation_id: string | null;
}

/** HU-CON-11: lectura de contabilidad.auditoria con los índices por entidad, usuario y fecha. */
export class PgAuditoriaRepository implements AuditoriaRepository {
  constructor(private readonly db: Queryable) {}

  async buscar(filtro: FiltroAuditoria): Promise<PaginaAuditoria> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    const agregar = (condicion: (n: number) => string, valor: unknown) => {
      params.push(valor);
      condiciones.push(condicion(params.length));
    };
    if (filtro.entidad) agregar((n) => `entidad = $${n}`, filtro.entidad);
    if (filtro.entidadId) agregar((n) => `entidad_id = $${n}`, filtro.entidadId);
    if (filtro.usuario) agregar((n) => `usuario = $${n}`, filtro.usuario);
    // Días en hora de Colombia, expresados como rango de instantes para usar ix_auditoria_fecha.
    if (filtro.desde) {
      agregar(
        (n) => `fecha >= ($${n}::date::timestamp AT TIME ZONE '${ZONA_HORARIA_CONTABLE}')`,
        filtro.desde,
      );
    }
    if (filtro.hasta) {
      agregar(
        (n) => `fecha < (($${n}::date + 1)::timestamp AT TIME ZONE '${ZONA_HORARIA_CONTABLE}')`,
        filtro.hasta,
      );
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const total = await this.db.query<{ total: string }>(
      `SELECT count(*) AS total FROM contabilidad.auditoria ${where}`,
      params,
    );
    const { rows } = await this.db.query<Fila>(
      `SELECT id, entidad, entidad_id, accion, usuario, fecha, valores_anteriores, valores_nuevos,
              correlation_id
         FROM contabilidad.auditoria
         ${where}
        ORDER BY fecha DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtro.size, (filtro.page - 1) * filtro.size],
    );
    return {
      items: rows.map((f) => ({
        id: Number(f.id),
        entidad: f.entidad,
        entidadId: f.entidad_id,
        accion: f.accion,
        usuario: f.usuario,
        fecha: f.fecha.toISOString(),
        valoresAnteriores: f.valores_anteriores,
        valoresNuevos: f.valores_nuevos,
        correlationId: f.correlation_id,
      })),
      page: filtro.page,
      size: filtro.size,
      total: Number(total.rows[0]?.total ?? 0),
    };
  }
}
