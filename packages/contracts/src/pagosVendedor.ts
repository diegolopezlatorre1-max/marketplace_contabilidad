import { z } from 'zod';
import { fechaContableSchema } from './comisiones';
import { montoPositivoSchema, paginacionQuerySchema } from './common';

/**
 * POST /pagos-vendedor (HU-CON-10, rol CONTADOR). El pago descuenta primero el saldo a favor
 * del marketplace y se aplica a las cuentas pendientes más antiguas (FIFO por periodo, D-06).
 */
export const registrarPagoVendedorSchema = z.object({
  vendedorId: z.string().trim().min(1, 'El vendedor es obligatorio').max(64),
  /** Valor transferido al vendedor. */
  valor: montoPositivoSchema,
  /** Referencia bancaria del pago; única por vendedor. */
  referencia: z.string().trim().min(1, 'La referencia del pago es obligatoria').max(100),
  /** Soporte del pago (número de comprobante, enlace al archivo...). */
  soporte: z.string().trim().max(500).optional(),
  /** Día del pago (hora de Colombia); por defecto, hoy. */
  fecha: fechaContableSchema.optional(),
});
export type RegistrarPagoVendedorRequest = z.infer<typeof registrarPagoVendedorSchema>;

/** GET /pagos-vendedor?vendedorId=&desde=&hasta=&page=&size= (fechas del pago, inclusive). */
export const listarPagosVendedorQuerySchema = paginacionQuerySchema.extend({
  vendedorId: z.string().min(1).max(64).optional(),
  desde: fechaContableSchema.optional(),
  hasta: fechaContableSchema.optional(),
});
export type ListarPagosVendedorQuery = z.infer<typeof listarPagosVendedorQuerySchema>;

/** Parte de un pago aplicada a una cuenta (quincena) del vendedor. */
export interface AplicacionPagoDto {
  periodo: string;
  valorAplicado: string;
  saldoAnterior: string;
  saldoNuevo: string;
  /** Estado en que quedó la cuenta. */
  estado: 'PARCIAL' | 'PAGADO';
}

/** Pago registrado a un vendedor (HU-CON-10). Montos como string decimal. */
export interface PagoVendedorDto {
  id: string;
  vendedorId: string;
  /** Instante del pago (ISO 8601). */
  fecha: string;
  /** Día contable del pago. */
  fechaContable: string;
  /** Valor transferido. */
  valor: string;
  /** Saldo a favor del marketplace descontado con este pago. */
  saldoAFavorAplicado: string;
  referencia: string;
  soporte: string | null;
  /** Cuentas a las que se aplicó, de la más antigua a la más reciente. */
  aplicaciones: AplicacionPagoDto[];
  registradoPor: string;
  registradoEn: string;
}
