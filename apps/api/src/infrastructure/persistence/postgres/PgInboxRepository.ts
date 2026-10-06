import type { InboxRepository } from '../../../application/ports/out/InboxRepository';
import type { Queryable } from './pool';

export class PgInboxRepository implements InboxRepository {
  constructor(private readonly db: Queryable) {}

  async yaProcesado(eventId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `SELECT 1 FROM contabilidad.inbox WHERE event_id = $1`,
      [eventId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** La restricción UNIQUE(event_id) es la barrera final ante eventos concurrentes. */
  async marcarProcesado(eventId: string, tipo: string, payload: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.inbox (event_id, tipo, payload) VALUES ($1, $2, $3)`,
      [eventId, tipo, JSON.stringify(payload)],
    );
  }

  async registrarIgnorado(
    eventId: string,
    tipo: string,
    motivo: string,
    payload: unknown,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.evento_ignorado (event_id, tipo, motivo, payload)
       VALUES ($1, $2, $3, $4)`,
      [eventId, tipo, motivo, JSON.stringify(payload)],
    );
  }
}
