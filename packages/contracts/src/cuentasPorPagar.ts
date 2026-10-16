import { z } from 'zod';
import { periodoSchema } from './common';

export const ESTADOS_CUENTA_POR_PAGAR = ['PENDIENTE', 'PAGADO'] as const;
export type EstadoCuentaPorPagar = (typeof ESTADOS_CUENTA_POR_PAGAR)[number];

/** GET /cuentas-por-pagar?periodo=&estado=&vendedorId= */
export const listarCuentasPorPagarQuerySchema = z.object({
  periodo: periodoSchema.optional(),
  estado: z.enum(ESTADOS_CUENTA_POR_PAGAR).optional(),
  vendedorId: z.string().min(1).max(64).optional(),
});
export type ListarCuentasPorPagarQuery = z.infer<typeof listarCuentasPorPagarQuerySchema>;

/** Saldo a pagar a un vendedor en una quincena (HU-CON-03). Montos como string decimal. */
export interface CuentaPorPagarDto {
  vendedorId: string;
  periodo: string;
  totalNeto: string;
  valorPagado: string;
  saldoPendiente: string;
  estado: EstadoCuentaPorPagar;
}

/** GET /periodos: quincenas con ventas, de la más reciente a la más antigua. */
export interface PeriodosResponse {
  periodos: string[];
}
