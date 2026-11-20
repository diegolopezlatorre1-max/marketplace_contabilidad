import { z } from 'zod';
import { periodoSchema } from './common';

/** Identificador de vendedor en la ruta /vendedores/{id}/estado. */
export const vendedorIdParamSchema = z.object({ id: z.string().trim().min(1).max(64) });

/** GET /vendedores/{id}/estado?desde=&hasta= (HU-CON-07). desde / hasta son quincenas, inclusive. */
export const estadoVendedorQuerySchema = z.object({
  desde: periodoSchema.optional(),
  hasta: periodoSchema.optional(),
});
export type EstadoVendedorQueryParams = z.infer<typeof estadoVendedorQuerySchema>;

/** Movimientos de una quincena del vendedor (la de sus ventas, que es la de su cuenta). */
export interface EstadoVendedorPeriodoDto {
  periodo: string;
  ventas: number;
  vendido: string;
  comision: string;
  /** Neto revertido por ajustes sobre las ventas de la quincena. */
  ajustesNeto: string;
  /** Parte del neto revertido que ya estaba pagada: queda a favor del marketplace. */
  saldoAFavor: string;
  pagado: string;
  pendiente: string;
  estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
}

/** Estado financiero de un vendedor (HU-CON-07). Montos como string decimal. */
export interface EstadoVendedorDto {
  vendedorId: string;
  vendedorNombre: string;
  /** Quincenas consultadas; null = sin límite. */
  desde: string | null;
  hasta: string | null;
  totales: {
    ventas: number;
    vendido: string;
    comision: string;
    ajustes: {
      valor: string;
      comisionRevertida: string;
      netoRevertido: string;
      /** Parte del neto revertido que bajó el saldo de las cuentas. */
      descontadoDelSaldo: string;
      /** Parte del neto revertido que ya estaba pagada (se descuenta en el siguiente pago). */
      saldoAFavor: string;
    };
    /** Pagado a las cuentas (transferencias y saldo a favor compensado). */
    pagado: string;
    pendiente: string;
  };
  /** Saldo a favor del marketplace aún no descontado, de todas las quincenas. */
  saldoAFavorDisponible: string;
  /** Regla de control: vendido − comisión − ajustes = pagado + pendiente. */
  control: { cuadra: boolean; generado: string; liquidado: string; detalle: string };
  periodos: EstadoVendedorPeriodoDto[];
}
