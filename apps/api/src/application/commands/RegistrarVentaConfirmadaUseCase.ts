import { randomUUID } from 'node:crypto';
import { ComisionVenta } from '../../domain/comision/ComisionVenta';
import { InvalidValueError, Money } from '../../domain/shared';
import {
  ESTADO_CONFIRMADA,
  OrdenDuplicadaError,
  VentaContable,
} from '../../domain/venta/VentaContable';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { TransactionalRepositories, UnitOfWork } from '../ports/out/UnitOfWork';
import { exigirRol } from '../security';

/** Evento orden.confirmada v1 (docs/fase0/contratos-integracion.md), ya validado. */
export interface OrdenConfirmadaEntrada {
  eventId: string;
  tipo: string;
  numeroOrden: string;
  /** ISO 8601 con zona horaria. */
  fecha: string;
  estado: string;
  lineas: Array<{ vendedorId: string; valorBruto: string; categoriaId?: string | undefined }>;
}

export interface ResultadoEvento {
  eventId: string;
  resultado: 'PROCESADO' | 'YA_PROCESADO' | 'IGNORADO';
  detalle?: string;
  /** Ventas creadas (solo si PROCESADO). */
  ventas?: string[];
}

export const EVENTO_VENTA_REGISTRADA = 'contabilidad.venta.registrada';

/**
 * HU-CON-01 (con HU-CON-02 y HU-CON-03): registra una orden confirmada en una sola
 * transacción: una venta por línea/vendedor, su comisión con el % vigente y el neto
 * acumulado en la cuenta por pagar de la quincena; además inbox, auditoría y outbox.
 */
export class RegistrarVentaConfirmadaUseCase implements UseCase<
  OrdenConfirmadaEntrada,
  ResultadoEvento
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly generarId: () => string = randomUUID,
  ) {}

  async execute(orden: OrdenConfirmadaEntrada, ctx: ContextoEjecucion): Promise<ResultadoEvento> {
    exigirRol(ctx.actor, ['SISTEMA']);
    const fecha = new Date(orden.fecha);
    if (Number.isNaN(fecha.getTime()))
      throw new InvalidValueError(`Fecha inválida: ${orden.fecha}`);

    return this.uow.run(async (repos) => {
      // Un evento simultáneo con el mismo eventId espera aquí y luego ve YA_PROCESADO.
      await repos.inbox.bloquear(`evento:${orden.eventId}`);
      if (await repos.inbox.yaProcesado(orden.eventId)) {
        return { eventId: orden.eventId, resultado: 'YA_PROCESADO' };
      }

      if (orden.estado !== ESTADO_CONFIRMADA) {
        const motivo = `Estado ${orden.estado}: solo se registran órdenes ${ESTADO_CONFIRMADA}`;
        await repos.inbox.registrarIgnorado(orden.eventId, orden.tipo, motivo, orden);
        await repos.inbox.marcarProcesado(orden.eventId, orden.tipo, orden);
        return { eventId: orden.eventId, resultado: 'IGNORADO', detalle: motivo };
      }

      // La misma orden con otro eventId: el segundo espera y detecta el duplicado.
      await repos.inbox.bloquear(`orden:${orden.numeroOrden}`);
      // Orden fija por vendedor para que dos órdenes no bloqueen cuentas en orden cruzado.
      const lineas = [...orden.lineas].sort((a, b) => a.vendedorId.localeCompare(b.vendedorId));
      const ventas: string[] = [];
      for (const linea of lineas) {
        ventas.push(await this.registrarLinea(repos, orden, fecha, linea, ctx));
      }

      await repos.inbox.marcarProcesado(orden.eventId, orden.tipo, orden);
      return { eventId: orden.eventId, resultado: 'PROCESADO', ventas };
    });
  }

  private async registrarLinea(
    repos: TransactionalRepositories,
    orden: OrdenConfirmadaEntrada,
    fecha: Date,
    linea: OrdenConfirmadaEntrada['lineas'][number],
    ctx: ContextoEjecucion,
  ): Promise<string> {
    if (await repos.ventas.existe(orden.numeroOrden, linea.vendedorId)) {
      throw new OrdenDuplicadaError(orden.numeroOrden, linea.vendedorId);
    }
    const venta = VentaContable.registrar({
      id: this.generarId(),
      numeroOrden: orden.numeroOrden,
      vendedorId: linea.vendedorId,
      categoriaId: linea.categoriaId,
      fecha,
      valorBruto: Money.of(linea.valorBruto),
      estadoOrigen: orden.estado,
    });

    // HU-CON-02: % vigente en el día de la venta; queda guardado como porcentaje aplicado.
    const porcentaje = await repos.configuracionComision.obtenerVigente(
      venta.fechaContable,
      venta.vendedorId,
      venta.categoriaId ?? undefined,
    );
    const comision = ComisionVenta.calcular({
      numeroOrden: venta.numeroOrden,
      vendedorId: venta.vendedorId,
      valorBruto: venta.valorBruto,
      porcentaje,
      calculadaEn: this.clock.now(),
    });

    // HU-CON-03: el neto se acumula en la cuenta del vendedor en la quincena (bloqueada).
    const cuenta = await repos.cuentasPorPagar.obtenerParaActualizar(
      venta.vendedorId,
      venta.periodo,
    );
    await repos.ventas.guardar(venta, orden.eventId);
    await repos.comisiones.guardar(venta.id, comision);
    cuenta.acumular(comision, venta.fecha);
    await repos.cuentasPorPagar.guardar(cuenta);

    const comisionJson = comision.toJSON();
    await repos.auditoria.registrar({
      entidad: 'venta_contable',
      entidadId: venta.id,
      accion: 'REGISTRAR',
      usuario: ctx.actor.id,
      valoresNuevos: {
        venta: venta.toJSON(),
        comision: comisionJson,
        cuentaPorPagar: {
          periodo: cuenta.periodo.codigo,
          saldoPendiente: cuenta.saldoPendiente.toString(),
        },
        eventId: orden.eventId,
      },
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
    });
    await repos.outbox.publicar({
      tipo: EVENTO_VENTA_REGISTRADA,
      payload: {
        ventaId: venta.id,
        numeroOrden: venta.numeroOrden,
        vendedorId: venta.vendedorId,
        fecha: venta.fecha.toISOString(),
        periodo: venta.periodo.codigo,
        valorBruto: comisionJson.valorBruto,
        porcentajeAplicado: comisionJson.porcentajeAplicado,
        comision: comisionJson.comision,
        valorNeto: comisionJson.valorNeto,
      },
    });
    return venta.id;
  }
}
