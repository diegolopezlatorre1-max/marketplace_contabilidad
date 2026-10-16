import { randomUUID } from 'node:crypto';
import { AjusteExcedeSaldoError } from '../../domain/ajuste/AjusteContable';
import { InvalidValueError, Money } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { UnitOfWork } from '../ports/out/UnitOfWork';
import { exigirRol } from '../security';
import { aplicarAjuste } from './aplicarAjuste';
import type { ResultadoEvento } from './RegistrarVentaConfirmadaUseCase';

/** Eventos orden.cancelada / orden.devuelta v1 (docs/fase0/contratos-integracion.md), ya validados. */
export interface OrdenAjusteEntrada {
  eventId: string;
  tipo: 'orden.cancelada' | 'orden.devuelta';
  numeroOrden: string;
  /** ISO 8601 con zona horaria. */
  fecha: string;
  motivo: string;
  /** valorDevuelto solo en orden.devuelta (admite devoluciones parciales). */
  lineas: Array<{ vendedorId: string; valorDevuelto?: string | undefined }>;
}

export type ResultadoAjusteEvento = Omit<ResultadoEvento, 'ventas'> & { ajustes?: string[] };

/**
 * HU-CON-06: ajustes automáticos desde el módulo de Órdenes. Idempotente por eventId.
 * Una orden que nunca se registró (p. ej. cancelada antes de confirmarse) responde IGNORADO.
 */
export class ProcesarAjusteOrdenUseCase implements UseCase<
  OrdenAjusteEntrada,
  ResultadoAjusteEvento
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly generarId: () => string = randomUUID,
  ) {}

  async execute(
    evento: OrdenAjusteEntrada,
    ctx: ContextoEjecucion,
  ): Promise<ResultadoAjusteEvento> {
    exigirRol(ctx.actor, ['SISTEMA']);
    const fecha = new Date(evento.fecha);
    if (Number.isNaN(fecha.getTime())) {
      throw new InvalidValueError(`Fecha inválida: ${evento.fecha}`);
    }
    const tipo = evento.tipo === 'orden.cancelada' ? 'CANCELACION' : 'DEVOLUCION';

    return this.uow.run(async (repos) => {
      await repos.inbox.bloquear(`evento:${evento.eventId}`);
      if (await repos.inbox.yaProcesado(evento.eventId)) {
        return { eventId: evento.eventId, resultado: 'YA_PROCESADO' };
      }

      const ajustes: string[] = [];
      const omitidas: string[] = [];
      // Orden fija por vendedor para no bloquear ventas y cuentas en orden cruzado.
      const lineas = [...evento.lineas].sort((a, b) => a.vendedorId.localeCompare(b.vendedorId));
      for (const linea of lineas) {
        const venta = await repos.ventas.obtenerPorOrden(evento.numeroOrden, linea.vendedorId);
        if (!venta) {
          omitidas.push(`${linea.vendedorId}: sin venta registrada`);
          continue;
        }
        try {
          const ajuste = await aplicarAjuste(
            repos,
            venta,
            {
              tipo,
              motivo: evento.motivo,
              fecha,
              valor: linea.valorDevuelto ? Money.of(linea.valorDevuelto) : undefined,
              origen: 'EVENTO',
              eventId: evento.eventId,
            },
            ctx,
            this.clock.now(),
            this.generarId(),
          );
          ajustes.push(ajuste.id);
        } catch (error) {
          // Cancelar algo ya ajustado por completo no tiene efecto; una devolución que
          // excede lo ajustable sí es un error del emisor y revierte todo el evento.
          if (tipo === 'CANCELACION' && error instanceof AjusteExcedeSaldoError) {
            omitidas.push(`${linea.vendedorId}: ya ajustada por completo`);
            continue;
          }
          throw error;
        }
      }

      if (ajustes.length === 0) {
        const motivo = `Orden ${evento.numeroOrden} sin ajustes aplicables (${omitidas.join('; ')})`;
        await repos.inbox.registrarIgnorado(evento.eventId, evento.tipo, motivo, evento);
        await repos.inbox.marcarProcesado(evento.eventId, evento.tipo, evento);
        return { eventId: evento.eventId, resultado: 'IGNORADO', detalle: motivo };
      }
      await repos.inbox.marcarProcesado(evento.eventId, evento.tipo, evento);
      return {
        eventId: evento.eventId,
        resultado: 'PROCESADO',
        ajustes,
        ...(omitidas.length ? { detalle: `Líneas omitidas: ${omitidas.join('; ')}` } : {}),
      };
    });
  }
}
