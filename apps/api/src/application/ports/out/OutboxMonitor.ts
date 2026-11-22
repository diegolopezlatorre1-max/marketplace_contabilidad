/** Estado de la cola de eventos salientes, para el health check. */
export interface EstadoOutbox {
  pendientes: number;
  deadLetter: number;
}

export interface OutboxMonitor {
  contar(): Promise<EstadoOutbox>;
}
