import type {
  ExportacionRepository,
  FiltroExportacion,
} from '../../../src/application/ports/out/ExportacionRepository';
import { Money } from '../../../src/domain/shared';
import type { DatosEnMemoria } from './enMemoria';

const enRango = (fecha: string, vendedor: string, f: FiltroExportacion) =>
  fecha >= f.desde && fecha <= f.hasta && (!f.vendedorId || vendedor === f.vendedorId);

/** HU-CON-08: mismas filas que PgExportacionRepository, sobre la base en memoria. */
export function exportacionEnMemoria(db: { datos: DatosEnMemoria }): ExportacionRepository {
  return {
    ventas: async (f) =>
      db.datos.ventas
        .map(({ venta }) => venta)
        .filter((v) => enRango(v.fechaContable, v.vendedorId, f))
        .sort(
          (a, b) =>
            a.fechaContable.localeCompare(b.fechaContable) ||
            a.numeroOrden.localeCompare(b.numeroOrden),
        )
        .map((v) => {
          const c = db.datos.comisiones.find((x) => x.ventaId === v.id)!.comision;
          const cuenta = db.datos.cuentas.find(
            (x) => x.vendedorId === v.vendedorId && x.periodo === v.periodo.codigo,
          );
          const saldo = cuenta ? cuenta.totalNeto.subtract(cuenta.pagado) : Money.CERO;
          const valorOrden = Money.sum(
            db.datos.ventas
              .filter(({ venta }) => venta.numeroOrden === v.numeroOrden)
              .map(({ venta }) => venta.valorBruto),
          );
          const aplicado = Money.sum(
            db.datos.conciliaciones.flatMap((k) =>
              k
                .toJSON()
                .detalles.filter((d) => d.numeroOrden === v.numeroOrden)
                .map((d) => Money.of(d.valorAplicado)),
            ),
          );
          const estadoPago =
            cuenta && cuenta.totalNeto.isPositive() && saldo.isZero()
              ? 'PAGADO'
              : cuenta?.pagado.isPositive()
                ? 'PARCIAL'
                : 'PENDIENTE';
          const estadoConciliacion = !aplicado.isPositive()
            ? 'SIN_CONCILIAR'
            : aplicado.lessThan(valorOrden)
              ? 'PARCIAL'
              : 'CONCILIADA';
          return {
            fechaContable: v.fechaContable,
            numeroOrden: v.numeroOrden,
            vendedorId: v.vendedorId,
            valorBruto: v.valorBruto.toString(),
            porcentajeAplicado: c.porcentajeAplicado.toString(),
            comision: c.comision.toString(),
            valorNeto: c.valorNeto.toString(),
            estadoPago,
            estadoConciliacion,
            ajustes: Money.sum(
              db.datos.ajustes
                .map(({ ajuste }) => ajuste)
                .filter((a) => a.ventaId === v.id && a.fechaContable <= f.hasta)
                .map((a) => a.valor),
            ).toString(),
          } as const;
        }),
    ajustes: async (f) =>
      db.datos.ajustes
        .map(({ ajuste }) => ajuste)
        .filter((a) => enRango(a.fechaContable, a.vendedorId, f))
        .sort((a, b) => a.fechaContable.localeCompare(b.fechaContable))
        .map((a) => ({
          fechaContable: a.fechaContable,
          numeroOrden: a.numeroOrden,
          vendedorId: a.vendedorId,
          tipo: a.tipo,
          motivo: a.motivo,
          valor: a.valor.toString(),
          comisionRevertida: a.comisionRevertida.toString(),
          netoRevertido: a.netoRevertido.toString(),
        })),
  };
}
