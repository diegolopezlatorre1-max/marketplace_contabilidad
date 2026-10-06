/**
 * Registro de eventos entrantes ya procesados: garantiza idempotencia
 * (un evento repetido no produce efectos de nuevo).
 */
export interface InboxRepository {
  yaProcesado(eventId: string): Promise<boolean>;
  marcarProcesado(eventId: string, tipo: string, payload: unknown): Promise<void>;
  registrarIgnorado(eventId: string, tipo: string, motivo: string, payload: unknown): Promise<void>;
}
