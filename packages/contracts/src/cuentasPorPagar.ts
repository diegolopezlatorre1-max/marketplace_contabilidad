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

/** GET /cuentas-por-pagar/resumen?periodo= */
export const resumenCuentasPorPagarQuerySchema = z.object({
  periodo: periodoSchema.optional(),
});
export type ResumenCuentasPorPagarQuery = z.infer<typeof resumenCuentasPorPagarQuerySchema>;

/** Saldo a pagar a un vendedor en una quincena (HU-CON-03). Montos como string decimal. */
export interface CuentaPorPagarDto {
  vendedorId: string;
  /** Nombre o razón social del módulo de Vendedores; el id si no se conoce. */
  vendedorNombre: string;
  periodo: string;
  totalNeto: string;
  valorPagado: string;
  saldoPendiente: string;
  estado: EstadoCuentaPorPagar;
}

/** Saldo total de un vendedor sumando sus cuentas (de un periodo o de todos). */
export interface ResumenSaldoVendedorDto {
  vendedorId: string;
  vendedorNombre: string;
  /** Número de cuentas (quincenas) que suma. */
  cuentas: number;
  totalNeto: string;
  valorPagado: string;
  saldoPendiente: string;
}

/** GET /periodos: quincenas con ventas, de la más reciente a la más antigua. */
export interface PeriodosResponse {
  periodos: string[];
}
