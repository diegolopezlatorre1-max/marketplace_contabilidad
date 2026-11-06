import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { ExportacionRepository } from '../ports/out/ExportacionRepository';
import type { SellersGateway } from '../ports/out/SellersGateway';
import type { ColumnaHoja, SpreadsheetExporter } from '../ports/out/SpreadsheetExporter';
import { exigirRol } from '../security';
import type { ReporteIngresosEntrada, ReporteIngresosQuery } from './ReporteIngresosQuery';

export interface ArchivoExportado {
  nombre: string;
  contentType: string;
  contenido: Buffer;
}

const ESTADO_PAGO = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', PAGADO: 'Pagado' } as const;
const ESTADO_CONCILIACION = {
  CONCILIADA: 'Conciliada',
  PARCIAL: 'Parcial',
  SIN_CONCILIAR: 'Sin conciliar',
} as const;

/** Columnas de la hoja de ventas: las de D-09, más el nombre del vendedor. */
const COLUMNAS_VENTAS: ColumnaHoja[] = [
  { titulo: 'Fecha', tipo: 'fecha', ancho: 12 },
  { titulo: 'Número de orden', tipo: 'texto', ancho: 18 },
  { titulo: 'Vendedor', tipo: 'texto', ancho: 12 },
  { titulo: 'Nombre del vendedor', tipo: 'texto', ancho: 30 },
  { titulo: 'Valor bruto', tipo: 'moneda', ancho: 16, totalizar: true },
  { titulo: '% comisión', tipo: 'porcentaje', ancho: 12 },
  { titulo: 'Comisión', tipo: 'moneda', ancho: 16, totalizar: true },
  { titulo: 'Valor neto', tipo: 'moneda', ancho: 16, totalizar: true },
  { titulo: 'Estado de pago', tipo: 'texto', ancho: 15 },
  { titulo: 'Estado de conciliación', tipo: 'texto', ancho: 22 },
  { titulo: 'Ajustes', tipo: 'moneda', ancho: 16, totalizar: true },
];

const COLUMNAS_AJUSTES: ColumnaHoja[] = [
  { titulo: 'Fecha', tipo: 'fecha', ancho: 12 },
  { titulo: 'Número de orden', tipo: 'texto', ancho: 18 },
  { titulo: 'Vendedor', tipo: 'texto', ancho: 12 },
  { titulo: 'Tipo', tipo: 'texto', ancho: 14 },
  { titulo: 'Motivo', tipo: 'texto', ancho: 40 },
  { titulo: 'Valor', tipo: 'moneda', ancho: 16, totalizar: true },
  { titulo: 'Comisión revertida', tipo: 'moneda', ancho: 18, totalizar: true },
  { titulo: 'Neto revertido', tipo: 'moneda', ancho: 16, totalizar: true },
];

/**
 * HU-CON-08: exporta a Excel la información contable de un rango de días. Reutiliza la consulta
 * del reporte de ingresos (HU-CON-05): mismas validaciones y la hoja "Resumen" tiene los mismos
 * números que la pantalla. Columnas de la hoja de ventas según D-09.
 */
export class ExportarExcelUseCase implements UseCase<ReporteIngresosEntrada, ArchivoExportado> {
  constructor(
    private readonly reporte: ReporteIngresosQuery,
    private readonly filas: ExportacionRepository,
    private readonly exportador: SpreadsheetExporter,
    private readonly vendedores: SellersGateway,
    private readonly clock: Clock,
  ) {}

  async execute(
    entrada: ReporteIngresosEntrada,
    ctx: ContextoEjecucion,
  ): Promise<ArchivoExportado> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    // El reporte valida el rango (formato, orden y máximo de días) y da los totales.
    const r = await this.reporte.execute(entrada, ctx);
    const filtro = { desde: r.desde, hasta: r.hasta, vendedorId: entrada.vendedorId };
    const [ventas, ajustes] = await Promise.all([
      this.filas.ventas(filtro),
      this.filas.ajustes(filtro),
    ]);
    const nombres = await this.vendedores.obtenerNombres([
      ...new Set(ventas.map((v) => v.vendedorId)),
    ]);

    const contenido = await this.exportador.exportar({
      hojas: [
        {
          nombre: 'Ventas',
          columnas: COLUMNAS_VENTAS,
          conTotales: true,
          filas: ventas.map((v) => [
            v.fechaContable,
            v.numeroOrden,
            v.vendedorId,
            nombres.get(v.vendedorId) ?? v.vendedorId,
            v.valorBruto,
            v.porcentajeAplicado,
            v.comision,
            v.valorNeto,
            ESTADO_PAGO[v.estadoPago],
            ESTADO_CONCILIACION[v.estadoConciliacion],
            v.ajustes,
          ]),
        },
        {
          nombre: 'Ajustes',
          columnas: COLUMNAS_AJUSTES,
          conTotales: true,
          filas: ajustes.map((a) => [
            a.fechaContable,
            a.numeroOrden,
            a.vendedorId,
            a.tipo === 'DEVOLUCION' ? 'Devolución' : 'Cancelación',
            a.motivo,
            a.valor,
            a.comisionRevertida,
            a.netoRevertido,
          ]),
        },
        {
          nombre: 'Resumen',
          columnas: [
            { titulo: 'Concepto', tipo: 'texto', ancho: 26 },
            { titulo: 'Cantidad', tipo: 'entero', ancho: 10 },
            { titulo: 'Valor bruto', tipo: 'moneda', ancho: 16 },
            { titulo: 'Comisión', tipo: 'moneda', ancho: 16 },
            { titulo: 'Valor neto', tipo: 'moneda', ancho: 16 },
          ],
          filas: [
            [
              'Ventas',
              r.ventas.cantidad,
              r.ventas.valorBruto,
              r.ventas.comision,
              r.ventas.valorNeto,
            ],
            [
              'Ajustes',
              r.ajustes.cantidad,
              r.ajustes.valorBruto,
              r.ajustes.comision,
              r.ajustes.valorNeto,
            ],
            [
              'Total (ventas − ajustes)',
              null,
              r.totales.valorBruto,
              r.totales.comision,
              r.totales.valorNeto,
            ],
          ],
        },
      ],
      metadatos: [
        ['Reporte', 'Información contable del marketplace'],
        ['Desde', r.desde],
        ['Hasta', r.hasta],
        ['Vendedor', entrada.vendedorId ?? 'Todos'],
        ['Generado', this.clock.now().toISOString()],
        ['Usuario', ctx.actor.id],
        ['Control', r.control.detalle],
        ['Fechas', 'Días contables en hora de Colombia; ajustes por la fecha del ajuste'],
        ['Moneda', 'COP'],
      ],
    });

    // Solo caracteres seguros en el nombre del archivo.
    const vendedor = entrada.vendedorId ? `_${entrada.vendedorId.replace(/[^\w-]/g, '_')}` : '';
    return {
      nombre: `contabilidad_${r.desde}_${r.hasta}${vendedor}.${this.exportador.extension}`,
      contentType: this.exportador.contentType,
      contenido,
    };
  }
}
