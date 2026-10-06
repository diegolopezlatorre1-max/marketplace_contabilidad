export interface RegistroAuditoria {
  entidad: string;
  entidadId: string;
  accion: string;
  usuario: string;
  valoresAnteriores?: unknown;
  valoresNuevos?: unknown;
  correlationId?: string;
}

/** Trazabilidad de cada comando (requisito transversal H-11, HU-CON-11). */
export interface AuditLogger {
  registrar(registro: RegistroAuditoria): Promise<void>;
}
