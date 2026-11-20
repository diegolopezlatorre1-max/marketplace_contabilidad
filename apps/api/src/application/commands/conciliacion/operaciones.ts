import {
  Conciliacion,
  OrdenInexistenteError,
  type PoliticaConciliacion,
} from '../../../domain/conciliacion/Conciliacion';
import {
  PagoRecibido,
  ReferenciaDuplicadaError,
  type OrigenPago,
} from '../../../domain/conciliacion/PagoRecibido';
import { DomainError, Money } from '../../../domain/shared';
import type { ContextoEjecucion } from '../../ports/in/UseCase';
import type { Clock } from '../../ports/out/Clock';
import type { TransactionalRepositories } from '../../ports/out/UnitOfWork';

export const EVENTO_CONCILIACION_CERRADA = 'contabilidad.conciliacion.cerrada';

/** Dependencias comunes de los casos de uso de conciliación (HU-CON-04). */
export interface DependenciasConciliacion {
  clock: Clock;
  politica: PoliticaConciliacion;
  generarId: () => string;
}

export interface OrdenSolicitada {
  numeroOrden: string;
  /** String decimal; si falta se aplica el saldo pendiente de la orden. */
  valorAplicado?: string | undefined;
}

export interface DatosPagoRecibido {
  referenciaPasarela: string;
  fecha: Date;
  valor: string;
  origen: OrigenPago;
  eventId?: string | null | undefined;
  ordenes?: readonly string[] | undefined;
}

function auditar(ctx: ContextoEjecucion) {
  return {
    usuario: ctx.actor.id,
    ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
  };
}

/**
 * Arma la conciliación de un pago (sin escribir nada). Bloquea cada orden en un
 * orden fijo para que dos conciliaciones simultáneas no apliquen el mismo saldo.
 */
export async function prepararConciliacion(
  repos: TransactionalRepositories,
  pago: PagoRecibido,
  solicitadas: readonly OrdenSolicitada[],
  deps: DependenciasConciliacion,
  ctx: ContextoEjecucion,
): Promise<Conciliacion> {
  const numeros = [...new Set(solicitadas.map((o) => o.numeroOrden))].sort();
  for (const numero of numeros) await repos.inbox.bloquear(`orden:${numero}`);

  const info = new Map(
    (await repos.conciliaciones.ordenesPorConciliar(numeros)).map((o) => [o.numeroOrden, o]),
  );
  return Conciliacion.conciliar({
    id: deps.generarId(),
    pago,
    ordenes: solicitadas.map((s) => {
      const orden = info.get(s.numeroOrden);
      if (!orden) throw new OrdenInexistenteError(s.numeroOrden);
      return { orden, valorAplicado: s.valorAplicado ? Money.of(s.valorAplicado) : undefined };
    }),
    politica: deps.politica,
    usuario: ctx.actor.id,
    fecha: deps.clock.now(),
  });
}

/** Guarda la conciliación con su auditoría; si queda CONCILIADA lo publica (outbox). */
export async function guardarConciliacion(
  repos: TransactionalRepositories,
  conciliacion: Conciliacion,
  ctx: ContextoEjecucion,
): Promise<void> {
  await repos.conciliaciones.guardar(conciliacion);
  const datos = conciliacion.toJSON();
  await repos.auditoria.registrar({
    entidad: 'conciliacion',
    entidadId: conciliacion.id,
    accion: 'CONCILIAR',
    valoresNuevos: datos,
    ...auditar(ctx),
  });
  if (conciliacion.estado === 'CONCILIADA') {
    await repos.outbox.publicar({
      tipo: EVENTO_CONCILIACION_CERRADA,
      payload: {
        conciliacionId: datos.id,
        pagoId: datos.pagoId,
        referenciaPasarela: datos.referenciaPasarela,
        valorPago: datos.valorPago,
        ordenes: datos.detalles.map((d) => d.numeroOrden),
      },
    });
  }
}

export interface PagoRegistrado {
  pago: PagoRecibido;
  conciliacion?: Conciliacion;
  /** Por qué no se concilió automáticamente (órdenes informadas que no sirven). */
  motivoSinConciliar?: string;
}

/** Estado del pago para la bandeja: sin conciliación, conciliado o con diferencia. */
export function estadoDelPago({
  conciliacion,
}: PagoRegistrado): 'SIN_CONCILIAR' | 'CONCILIADO' | 'PENDIENTE' {
  if (!conciliacion) return 'SIN_CONCILIAR';
  return conciliacion.estado === 'CONCILIADA' ? 'CONCILIADO' : 'PENDIENTE';
}

/**
 * Registra un pago recibido (evento o CSV) dentro de la transacción en curso. Si la
 * pasarela informa órdenes, intenta conciliarlo; si no se puede, el pago queda
 * SIN_CONCILIAR con el motivo, para que el contador lo concilie a mano.
 */
export async function registrarPago(
  repos: TransactionalRepositories,
  datos: DatosPagoRecibido,
  deps: DependenciasConciliacion,
  ctx: ContextoEjecucion,
): Promise<PagoRegistrado> {
  const pago = PagoRecibido.registrar({
    id: deps.generarId(),
    referenciaPasarela: datos.referenciaPasarela,
    fecha: datos.fecha,
    valor: Money.of(datos.valor),
    origen: datos.origen,
    eventId: datos.eventId,
    ordenesInformadas: datos.ordenes,
  });
  // La misma referencia con otro eventId (o en otra fila del CSV) espera aquí.
  await repos.inbox.bloquear(`pago:${pago.referenciaPasarela}`);
  if (await repos.pagosRecibidos.existeReferencia(pago.referenciaPasarela)) {
    throw new ReferenciaDuplicadaError(pago.referenciaPasarela);
  }
  await repos.pagosRecibidos.guardar(pago, ctx.actor.id);
  await repos.auditoria.registrar({
    entidad: 'pago_recibido',
    entidadId: pago.id,
    accion: 'REGISTRAR',
    valoresNuevos: pago.toJSON(),
    ...auditar(ctx),
  });

  if (pago.ordenesInformadas.length === 0) return { pago };
  let conciliacion: Conciliacion;
  try {
    // Solo lecturas y reglas de dominio: un error aquí no invalida la transacción.
    conciliacion = await prepararConciliacion(
      repos,
      pago,
      pago.ordenesInformadas.map((numeroOrden) => ({ numeroOrden })),
      deps,
      ctx,
    );
  } catch (error) {
    if (error instanceof DomainError) return { pago, motivoSinConciliar: error.message };
    throw error;
  }
  await guardarConciliacion(repos, conciliacion, ctx);
  return { pago, conciliacion };
}
