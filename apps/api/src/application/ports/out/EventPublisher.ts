export interface EventoDeIntegracion {
  tipo: string;
  payload: Record<string, unknown>;
}

/**
 * Publica eventos de contabilidad hacia el marketplace.
 * El adaptador de PostgreSQL los escribe en la tabla outbox dentro de la
 * misma transacción del cambio de negocio (ver docs/adr/0003).
 */
export interface EventPublisher {
  publicar(evento: EventoDeIntegracion): Promise<void>;
}
