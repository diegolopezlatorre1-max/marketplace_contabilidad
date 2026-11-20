import { InvalidValueError, Money, parseFechaContable } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type {
  FilaDiaReporte,
  ReporteIngresosRepository,
} from '../ports/out/ReporteIngresosRepository';
import { exigirRol } from '../security';

/** Rango máximo del reporte, para acotar la consulta. */
export const MAX_DIAS_REPORTE = 366;

export interface ReporteIngresosEntrada {
  desde: string;
  hasta: string;
  vendedorId?: string | undefined;
}

export interface TotalesMovimientos {
  cantidad: number;
  valorBruto: string;
  comision: string;
  valorNeto: string;
}

type Montos = Omit<TotalesMovimientos, 'cantidad'>;

export interface ReporteIngresos {
  desde: string;
  hasta: string;
  vendedorId: string | null;
  ventas: TotalesMovimientos;
  ajustes: TotalesMovimientos;
  totales: Montos;
  control: { cuadra: boolean; detalle: string };
  porDia: Array<{
    fecha: string;
    ventas: TotalesMovimientos;
    ajustes: TotalesMovimientos;
    totales: Montos;
  }>;
}

interface Suma {
  cantidad: number;
  bruto: Money;
  comision: Money;
  neto: Money;
}

const CERO: Suma = { cantidad: 0, bruto: Money.CERO, comision: Money.CERO, neto: Money.CERO };

const sumar = (a: Suma, f: FilaDiaReporte): Suma => ({
  cantidad: a.cantidad + f.cantidad,
  bruto: a.bruto.add(Money.of(f.valorBruto)),
  comision: a.comision.add(Money.of(f.comision)),
  neto: a.neto.add(Money.of(f.valorNeto)),
});

const restar = (a: Suma, b: Suma) => ({
  bruto: a.bruto.subtract(b.bruto),
  comision: a.comision.subtract(b.comision),
  neto: a.neto.subtract(b.neto),
});

const cuadra = (s: { bruto: Money; comision: Money; neto: Money }) =>
  s.comision.add(s.neto).equals(s.bruto);

const aTotales = (s: Suma): TotalesMovimientos => ({
  cantidad: s.cantidad,
  valorBruto: s.bruto.toString(),
  comision: s.comision.toString(),
  valorNeto: s.neto.toString(),
});

const aMontos = (s: { bruto: Money; comision: Money; neto: Money }): Montos => ({
  valorBruto: s.bruto.toString(),
  comision: s.comision.toString(),
  valorNeto: s.neto.toString(),
});

function diasEntre(desde: string, hasta: string): number {
  return (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000;
}

/**
 * HU-CON-05: ingresos y comisiones por rango de días contables (hora de Colombia).
 * Ventas por su fecha y ajustes (HU-CON-06) por la fecha del ajuste; totales = ventas − ajustes.
 * El bloque de control verifica bruto = comisión + neto. Sumas con Money, nunca con number.
 */
export class ReporteIngresosQuery implements UseCase<ReporteIngresosEntrada, ReporteIngresos> {
  constructor(private readonly reporte: ReporteIngresosRepository) {}

  async execute(entrada: ReporteIngresosEntrada, ctx: ContextoEjecucion): Promise<ReporteIngresos> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    const desde = parseFechaContable(entrada.desde);
    const hasta = parseFechaContable(entrada.hasta);
    if (desde > hasta) {
      throw new InvalidValueError('La fecha "desde" no puede ser posterior a "hasta"');
    }
    if (diasEntre(desde, hasta) + 1 > MAX_DIAS_REPORTE) {
      throw new InvalidValueError(`El rango del reporte admite máximo ${MAX_DIAS_REPORTE} días`);
    }

    const { ventas, ajustes } = await this.reporte.movimientosPorDia({
      desde,
      hasta,
      vendedorId: entrada.vendedorId,
    });

    const dias = new Map<string, { ventas: Suma; ajustes: Suma }>();
    const del = (fecha: string) => {
      const dia = dias.get(fecha) ?? { ventas: CERO, ajustes: CERO };
      dias.set(fecha, dia);
      return dia;
    };
    for (const f of ventas) del(f.fecha).ventas = sumar(CERO, f);
    for (const f of ajustes) del(f.fecha).ajustes = sumar(CERO, f);

    const totalVentas = ventas.reduce(sumar, CERO);
    const totalAjustes = ajustes.reduce(sumar, CERO);
    const totales = restar(totalVentas, totalAjustes);

    const fallas = [
      cuadra(totalVentas) ? null : 'ventas',
      cuadra(totalAjustes) ? null : 'ajustes',
      cuadra(totales) ? null : 'totales',
    ].filter(Boolean);

    return {
      desde,
      hasta,
      vendedorId: entrada.vendedorId ?? null,
      ventas: aTotales(totalVentas),
      ajustes: aTotales(totalAjustes),
      totales: aMontos(totales),
      control: {
        cuadra: fallas.length === 0,
        detalle: fallas.length
          ? `No cuadra bruto = comisión + neto en: ${fallas.join(', ')}`
          : 'Bruto = comisión + neto en ventas, ajustes y totales',
      },
      porDia: [...dias.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fecha, d]) => ({
          fecha,
          ventas: aTotales(d.ventas),
          ajustes: aTotales(d.ajustes),
          totales: aMontos(restar(d.ventas, d.ajustes)),
        })),
    };
  }
}
