import type { FechaContable } from '../../../domain/shared';

export interface FiltroAuditoria {
  entidad?: string | undefined;
  entidadId?: string | undefined;
  usuario?: string | undefined;
  /** Día del cambio en hora de Colombia (inclusive). */
  desde?: FechaContable | undefined;
  hasta?: FechaContable | undefined;
  page: number;
  size: number;
}

/** Modelo de lectura de un registro de auditoría (HU-CON-11). */
export interface RegistroAuditoriaLeido {
  id: number;
  entidad: string;
  entidadId: string;
  accion: string;
  usuario: string;
  fecha: string;
  valoresAnteriores: unknown;
  valoresNuevos: unknown;
  correlationId: string | null;
}

export interface PaginaAuditoria {
  items: RegistroAuditoriaLeido[];
  page: number;
  size: number;
  total: number;
}

/** Puerto de lectura de contabilidad.auditoria (la escritura es AuditLogger, D-13). */
export interface AuditoriaRepository {
  /** Del más reciente al más antiguo. */
  buscar(filtro: FiltroAuditoria): Promise<PaginaAuditoria>;
}
