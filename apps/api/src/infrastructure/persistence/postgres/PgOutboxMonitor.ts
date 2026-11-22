import type { EstadoOutbox, OutboxMonitor } from '../../../application/ports/out/OutboxMonitor';
import type { Queryable } from './pool';

export class PgOutboxMonitor implements OutboxMonitor {
  constructor(private readonly db: Queryable) {}

  async contar(): Promise<EstadoOutbox> {
    const { rows } = await this.db.query<{ pendientes: number; dead_letter: number }>(
      `SELECT count(*) FILTER (WHERE estado = 'PENDIENTE')::int AS pendientes,
              count(*) FILTER (WHERE estado = 'DEAD_LETTER')::int AS dead_letter
         FROM contabilidad.outbox`,
    );
    return { pendientes: rows[0]?.pendientes ?? 0, deadLetter: rows[0]?.dead_letter ?? 0 };
  }
}
