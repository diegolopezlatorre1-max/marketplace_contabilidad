import {
  AjusteContable,
  type OrigenAjuste,
  type TipoAjuste,
  type VentaAjustable,
} from '../../domain/ajuste/AjusteContable';
import { Money, Periodo, Porcentaje } from '../../domain/shared';
import type { ContextoEjecucion } from '../ports/in/UseCase';
import type { AjusteRegistrado } from '../ports/out/AjusteContableRepository';
import type { TransactionalRepositories } from '../ports/out/UnitOfWork';
import type { VentaDetalle } from '../ports/out/VentaContableRepository';

export const EVENTO_AJUSTE_REGISTRADO = 'contabilidad.ajuste.registrado';

export interface DatosAjuste {
  tipo: TipoAjuste;
  motivo: string;
  fecha: Date;
  valor?: Money | undefined;
  origen: OrigenAjuste;
  eventId?: string | undefined;
}

function aVentaAjustable(v: VentaDetalle): VentaAjustable {
  if (v.porcentajeAplicado === null || v.comision === null || v.valorNeto === null) {
    throw new Error(`La venta ${v.id} no tiene comisión registrada`);
  }
  return {
    ventaId: v.id,
    numeroOrden: v.numeroOrden,
    vendedorId: v.vendedorId,
    fecha: new Date(v.fecha),
    valorBruto: Money.of(v.valorBruto),
    porcentajeAplicado: Porcentaje.of(v.porcentajeAplicado),
    comision: Money.of(v.comision),
    valorNeto: Money.of(v.valorNeto),
  };
}

/**
 * HU-CON-06: registra un ajuste dentro de la transacción en curso. Lo comparten el ajuste
 * manual del contador y los eventos orden.cancelada / orden.devuelta.
 * Revierte el neto en la cuenta de la quincena de la venta (D-07, pendiente de validar);
 * lo que ya se había pagado queda como saldo a favor del marketplace.
 */
export async function aplicarAjuste(
  repos: TransactionalRepositories,
  venta: VentaDetalle,
  datos: DatosAjuste,
  ctx: ContextoEjecucion,
  ahora: Date,
  id: string,
): Promise<AjusteRegistrado> {
  // Dos ajustes simultáneos sobre la misma venta no pueden superar su valor.
  await repos.inbox.bloquear(`venta:${venta.id}`);
  const previos = await repos.ajustes.previosDeVenta(venta.id);
  const calculado = AjusteContable.registrar({
    id,
    venta: aVentaAjustable(venta),
    previos,
    ...datos,
    registradoPor: ctx.actor.id,
    ahora,
  });

  const cuenta = await repos.cuentasPorPagar.obtenerParaActualizar(
    venta.vendedorId,
    Periodo.parse(venta.periodo),
  );
  const saldoAnterior = cuenta.saldoPendiente;
  const ajuste = calculado.conSaldoAFavor(cuenta.revertir(calculado.netoRevertido));
  await repos.ajustes.guardar(ajuste, ahora);
  await repos.cuentasPorPagar.guardar(cuenta);

  const json = ajuste.toJSON();
  await repos.auditoria.registrar({
    entidad: 'ajuste_contable',
    entidadId: ajuste.id,
    accion: 'REGISTRAR',
    usuario: ctx.actor.id,
    valoresAnteriores: {
      cuentaPorPagar: { periodo: venta.periodo, saldoPendiente: saldoAnterior.toString() },
      ajustesPrevios: {
        valor: previos.valor.toString(),
        comision: previos.comision.toString(),
        neto: previos.neto.toString(),
      },
    },
    valoresNuevos: {
      ajuste: json,
      cuentaPorPagar: { periodo: venta.periodo, saldoPendiente: cuenta.saldoPendiente.toString() },
    },
    ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
  });
  await repos.outbox.publicar({
    tipo: EVENTO_AJUSTE_REGISTRADO,
    payload: {
      ajusteId: ajuste.id,
      ventaId: ajuste.ventaId,
      numeroOrden: ajuste.numeroOrden,
      vendedorId: ajuste.vendedorId,
      tipo: ajuste.tipo,
      fecha: json.fecha,
      periodo: json.periodo,
      valor: json.valor,
      comisionRevertida: json.comisionRevertida,
      netoRevertido: json.netoRevertido,
      saldoAFavor: json.saldoAFavor,
    },
  });

  return aAjusteRegistrado(ajuste, ahora);
}

/** Modelo de lectura de un ajuste recién registrado (la respuesta de POST /ajustes). */
export function aAjusteRegistrado(a: AjusteContable, registradoEn: Date): AjusteRegistrado {
  const j = a.toJSON();
  return {
    id: j.id,
    ventaId: j.ventaId,
    numeroOrden: j.numeroOrden,
    vendedorId: j.vendedorId,
    tipo: j.tipo,
    motivo: j.motivo,
    fecha: j.fecha,
    fechaContable: j.fechaContable,
    periodo: j.periodo,
    valor: j.valor,
    porcentajeAplicado: j.porcentajeAplicado,
    comisionRevertida: j.comisionRevertida,
    netoRevertido: j.netoRevertido,
    saldoAFavor: j.saldoAFavor,
    origen: j.origen,
    registradoPor: j.registradoPor,
    registradoEn: registradoEn.toISOString(),
  };
}
