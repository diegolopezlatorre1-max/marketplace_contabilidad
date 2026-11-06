import type { FechaContable } from '../../../domain/shared';

export interface FiltroExportacion {
  /** Días contables en hora de Colombia, inclusive. */
  desde: FechaContable;
  hasta: FechaContable;
  vendedorId?: string | undefined;
}

/** Una venta del rango con las columnas de D-09. Montos como string decimal. */
export interface VentaExportada {
  fechaContable: FechaContable;
  numeroOrden: string;
  vendedorId: string;
  valorBruto: string;
  porcentajeAplicado: string;
  comision: string;
  valorNeto: string;
  /** Estado de la cuenta por pagar de la venta (vendedor + quincena). */
  estadoPago: 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
  /** Estado de la orden frente a los pagos recibidos (HU-CON-04). */
  estadoConciliacion: 'CONCILIADA' | 'PARCIAL' | 'SIN_CONCILIAR';
  /** Valor ajustado sobre la venta hasta el final del rango (HU-CON-06). */
  ajustes: string;
}

/** Un ajuste del rango, ubicado por su propia fecha (igual que el reporte HU-CON-05). */
export interface AjusteExportado {
  fechaContable: FechaContable;
  numeroOrden: string;
  vendedorId: string;
  tipo: 'DEVOLUCION' | 'CANCELACION';
  motivo: string;
  valor: string;
  comisionRevertida: string;
  netoRevertido: string;
}

/** Puerto de lectura de las filas que se exportan a Excel (HU-CON-08). */
export interface ExportacionRepository {
  /** Ventas del rango por su fecha, ordenadas por fecha y número de orden. */
  ventas(filtro: FiltroExportacion): Promise<VentaExportada[]>;
  /** Ajustes del rango por la fecha del ajuste, ordenados por fecha. */
  ajustes(filtro: FiltroExportacion): Promise<AjusteExportado[]>;
}
