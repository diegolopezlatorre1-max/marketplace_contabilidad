import type {
  EventPublisher,
  EventoDeIntegracion,
} from '../../../application/ports/out/EventPublisher';
import type { Queryable } from './pool';

/** Escribe el evento en la tabla outbox; un relay lo publica después (Fase 5/6). */
export class PgOutboxPublisher implements EventPublisher {
  constructor(private readonly db: Queryable) {}

  async publicar(evento: EventoDeIntegracion): Promise<void> {
    await this.db.query(`INSERT INTO contabilidad.outbox (tipo, payload) VALUES ($1, $2)`, [
      evento.tipo,
      JSON.stringify(evento.payload),
    ]);
  }
}
