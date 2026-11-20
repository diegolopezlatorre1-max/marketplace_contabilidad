import type { AuditLogger, RegistroAuditoria } from '../../../application/ports/out/AuditLogger';
import type { Queryable } from './pool';

export class PgAuditLogger implements AuditLogger {
  constructor(private readonly db: Queryable) {}

  async registrar(r: RegistroAuditoria): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.auditoria
         (entidad, entidad_id, accion, usuario, valores_anteriores, valores_nuevos, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        r.entidad,
        r.entidadId,
        r.accion,
        r.usuario,
        r.valoresAnteriores === undefined ? null : JSON.stringify(r.valoresAnteriores),
        r.valoresNuevos === undefined ? null : JSON.stringify(r.valoresNuevos),
        r.correlationId ?? null,
      ],
    );
  }
}
