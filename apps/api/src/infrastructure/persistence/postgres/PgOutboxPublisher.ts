import type {
  EventPublisher,
  EventoDeIntegracion,
} from '../../../application/ports/out/EventPublisher';
import type { Queryable } from './pool';

/**
 * Escribe el evento en la tabla outbox, en la misma transacción del cambio de negocio.
 * OutboxRelay lo entrega después a los módulos suscritos (con reintentos y dead-letter).
 */
export class PgOutboxPublisher implements EventPublisher {
  constructor(private readonly db: Queryable) {}

  async publicar(evento: EventoDeIntegracion): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.outbox (tipo, payload, correlation_id) VALUES ($1, $2, $3)`,
      [evento.tipo, JSON.stringify(evento.payload), evento.correlationId ?? null],
    );
  }
}
