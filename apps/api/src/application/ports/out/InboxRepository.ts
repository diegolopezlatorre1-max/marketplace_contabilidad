/**
 * Registro de eventos entrantes ya procesados: garantiza idempotencia
 * (un evento repetido no produce efectos de nuevo).
 */
export interface InboxRepository {
  /**
   * Serializa hasta el fin de la transacción el procesamiento de una clave
   * (eventId, número de orden): un evento simultáneo espera y luego ve el resultado.
   */
  bloquear(clave: string): Promise<void>;
  yaProcesado(eventId: string): Promise<boolean>;
  marcarProcesado(eventId: string, tipo: string, payload: unknown): Promise<void>;
  registrarIgnorado(eventId: string, tipo: string, motivo: string, payload: unknown): Promise<void>;
}
