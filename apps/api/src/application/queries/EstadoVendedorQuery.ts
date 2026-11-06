import { control, totalizar } from '../../domain/cuentaPorPagar/EstadoVendedor';
import { InvalidValueError, Periodo } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { EstadoVendedorRepository } from '../ports/out/EstadoVendedorRepository';
import type { PagoVendedorRepository } from '../ports/out/PagoVendedorRepository';
import type { SellersGateway } from '../ports/out/SellersGateway';
import { exigirRol, NoAutorizadoError, tieneAlgunRol } from '../security';

export interface EstadoVendedorEntrada {
  vendedorId: string;
  /** Quincena inicial (AAAA-MM-Q1|Q2), inclusive. */
  desde?: string | undefined;
  /** Quincena final, inclusive. */
  hasta?: string | undefined;
}

/** Modelo de lectura del estado financiero de un vendedor. Montos como string decimal. */
export interface EstadoVendedor {
  vendedorId: string;
  vendedorNombre: string;
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
      descontadoDelSaldo: string;
      saldoAFavor: string;
    };
    pagado: string;
    pendiente: string;
  };
  /** Saldo a favor del marketplace aún no descontado (de todas las quincenas). */
  saldoAFavorDisponible: string;
  control: { cuadra: boolean; generado: string; liquidado: string; detalle: string };
  periodos: Array<{
    periodo: string;
    ventas: number;
    vendido: string;
    comision: string;
    ajustesNeto: string;
    saldoAFavor: string;
    pagado: string;
    pendiente: string;
    estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
  }>;
}

/**
 * HU-CON-07: total vendido, comisión, ajustes, pagado y pendiente de un vendedor, filtrable por
 * quincenas, con la regla de control vendido − comisión − ajustes = pagado + pendiente.
 */
export class EstadoVendedorQuery implements UseCase<EstadoVendedorEntrada, EstadoVendedor> {
  constructor(
    private readonly estados: EstadoVendedorRepository,
    private readonly pagos: Pick<PagoVendedorRepository, 'saldoAFavorDisponible'>,
    private readonly vendedores: SellersGateway,
  ) {}

  async execute(entrada: EstadoVendedorEntrada, ctx: ContextoEjecucion): Promise<EstadoVendedor> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO', 'VENDEDOR']);
    // Un vendedor solo ve su propio estado (preparado para cuando el marketplace lo requiera).
    if (
      !tieneAlgunRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']) &&
      ctx.actor.vendedorId !== entrada.vendedorId
    ) {
      throw new NoAutorizadoError('Un vendedor solo puede consultar su propio estado');
    }
    const vendedorId = entrada.vendedorId.trim();
    if (!vendedorId) throw new InvalidValueError('El vendedor es obligatorio');
    const desde = entrada.desde ? Periodo.parse(entrada.desde).codigo : undefined;
    const hasta = entrada.hasta ? Periodo.parse(entrada.hasta).codigo : undefined;
    if (desde && hasta && desde > hasta) {
      throw new InvalidValueError('La quincena "desde" no puede ser posterior a "hasta"');
    }

    const [periodos, saldoAFavor, nombres] = await Promise.all([
      this.estados.movimientosPorPeriodo(vendedorId, desde, hasta),
      this.pagos.saldoAFavorDisponible(vendedorId),
      this.vendedores.obtenerNombres([vendedorId]),
    ]);
    const t = totalizar(periodos);
    const c = control(t);

    return {
      vendedorId,
      vendedorNombre: nombres.get(vendedorId) ?? vendedorId,
      desde: desde ?? null,
      hasta: hasta ?? null,
      totales: {
        ventas: t.ventas,
        vendido: t.vendido.toString(),
        comision: t.comision.toString(),
        ajustes: {
          valor: t.ajustesValor.toString(),
          comisionRevertida: t.ajustesComision.toString(),
          netoRevertido: t.ajustesNeto.toString(),
          descontadoDelSaldo: t.ajustesDescontados.toString(),
          saldoAFavor: t.saldoAFavorGenerado.toString(),
        },
        pagado: t.pagado.toString(),
        pendiente: t.pendiente.toString(),
      },
      saldoAFavorDisponible: saldoAFavor.toString(),
      control: {
        cuadra: c.cuadra,
        generado: c.generado.toString(),
        liquidado: c.liquidado.toString(),
        detalle: c.cuadra
          ? 'Vendido − comisión − ajustes = pagado + pendiente'
          : 'No cuadra vendido − comisión − ajustes = pagado + pendiente',
      },
      periodos: periodos.map((p) => ({
        periodo: p.periodo,
        ventas: p.ventas,
        vendido: p.vendido.toString(),
        comision: p.comision.toString(),
        ajustesNeto: p.ajustes.netoRevertido.toString(),
        saldoAFavor: p.ajustes.saldoAFavor.toString(),
        pagado: p.pagado.toString(),
        pendiente: p.pendiente.toString(),
        estado: p.estado,
      })),
    };
  }
}
