import type { RegistroAuditoria } from '../../../src/application/ports/out/AuditLogger';
import type { EventoDeIntegracion } from '../../../src/application/ports/out/EventPublisher';
import type {
  TransactionalRepositories,
  UnitOfWork,
} from '../../../src/application/ports/out/UnitOfWork';
import type {
  FiltroVentas,
  VentaContableRepository,
} from '../../../src/application/ports/out/VentaContableRepository';
import type { ComisionVenta } from '../../../src/domain/comision/ComisionVenta';
import {
  ComisionNoConfiguradaError,
  ConfiguracionComision,
  seleccionarVigente,
  type AlcanceComision,
} from '../../../src/domain/comision/ConfiguracionComision';
import { CuentaPorPagar } from '../../../src/domain/cuentaPorPagar/cuentaPorPagar';
import { Money, Porcentaje, type Periodo } from '../../../src/domain/shared';
import type { VentaContable } from '../../../src/domain/venta/VentaContable';

/** Estado de una "base de datos" en memoria para probar casos de uso sin PostgreSQL. */
export interface DatosEnMemoria {
  configuraciones: ConfiguracionComision[];
  auditoria: RegistroAuditoria[];
  outbox: EventoDeIntegracion[];
  inbox: string[];
  ignorados: Array<{ eventId: string; motivo: string }>;
  ventas: Array<{ venta: VentaContable; eventId: string }>;
  comisiones: Array<{ ventaId: string; comision: ComisionVenta }>;
  cuentas: Array<{ vendedorId: string; periodo: string; totalNeto: Money; pagado: Money }>;
}

function vacio(): DatosEnMemoria {
  return {
    configuraciones: [],
    auditoria: [],
    outbox: [],
    inbox: [],
    ignorados: [],
    ventas: [],
    comisiones: [],
    cuentas: [],
  };
}

/** Copia superficial: los objetos de dominio guardados son inmutables. */
function copiar(d: DatosEnMemoria): DatosEnMemoria {
  return Object.fromEntries(
    Object.entries(d).map(([k, v]) => [k, [...(v as unknown[])]]),
  ) as unknown as DatosEnMemoria;
}

function repositorios(db: { datos: DatosEnMemoria }): TransactionalRepositories {
  const de = (alcance: AlcanceComision, ref: string | null) =>
    db.datos.configuraciones.filter((c) => c.alcance === alcance && c.referenciaId === ref);

  const ventas: VentaContableRepository = {
    existe: async (numeroOrden, vendedorId) =>
      db.datos.ventas.some(
        ({ venta }) => venta.numeroOrden === numeroOrden && venta.vendedorId === vendedorId,
      ),
    guardar: async (venta, eventId) => {
      db.datos.ventas.push({ venta, eventId });
    },
    listar: async (f: FiltroVentas) => {
      const items = db.datos.ventas
        .map(({ venta }) => venta)
        .filter(
          (v) =>
            (!f.desde || v.fechaContable >= f.desde) &&
            (!f.hasta || v.fechaContable <= f.hasta) &&
            (!f.vendedorId || v.vendedorId === f.vendedorId) &&
            (!f.periodo || v.periodo.codigo === f.periodo),
        )
        .map((v) => {
          const c = db.datos.comisiones.find((x) => x.ventaId === v.id)?.comision;
          return {
            ...v.toJSON(),
            porcentajeAplicado: c?.porcentajeAplicado.toString() ?? null,
            comision: c?.comision.toString() ?? null,
            valorNeto: c?.valorNeto.toString() ?? null,
          };
        });
      const inicio = (f.page - 1) * f.size;
      return {
        items: items.slice(inicio, inicio + f.size),
        page: f.page,
        size: f.size,
        total: items.length,
      };
    },
    listarPeriodos: async () =>
      [...new Set(db.datos.ventas.map(({ venta }) => venta.periodo.codigo))].sort().reverse(),
  };

  return {
    auditoria: { registrar: async (r) => void db.datos.auditoria.push(r) },
    outbox: { publicar: async (e) => void db.datos.outbox.push(e) },
    inbox: {
      bloquear: async () => {},
      yaProcesado: async (id) => db.datos.inbox.includes(id),
      marcarProcesado: async (id) => void db.datos.inbox.push(id),
      registrarIgnorado: async (eventId, _tipo, motivo) =>
        void db.datos.ignorados.push({ eventId, motivo }),
    },
    configuracionComision: {
      abiertaPara: async (alcance, ref) => de(alcance, ref).find((c) => c.abierta) ?? null,
      guardar: async (c) => void db.datos.configuraciones.push(c),
      actualizarCierre: async (c) => {
        db.datos.configuraciones = db.datos.configuraciones.map((f) => (f.id === c.id ? c : f));
      },
      vigenteEn: async (alcance, ref, fecha) =>
        de(alcance, ref).find((c) => c.cubre(fecha)) ?? null,
      historial: async (alcance, ref) =>
        [...de(alcance, ref)].sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde)),
      obtenerVigente: async (fecha, vendedorId, categoriaId) => {
        const c = seleccionarVigente(db.datos.configuraciones, fecha, vendedorId, categoriaId);
        if (!c) throw new ComisionNoConfiguradaError(fecha);
        return c.porcentaje;
      },
    },
    ventas,
    comisiones: {
      guardar: async (ventaId, comision) => void db.datos.comisiones.push({ ventaId, comision }),
    },
    cuentasPorPagar: {
      obtenerParaActualizar: async (vendedorId, periodo: Periodo) => {
        const fila = db.datos.cuentas.find(
          (c) => c.vendedorId === vendedorId && c.periodo === periodo.codigo,
        );
        return CuentaPorPagar.reconstituir({
          vendedorId,
          periodo,
          totalNeto: fila?.totalNeto ?? Money.CERO,
          pagado: fila?.pagado ?? Money.CERO,
          ordenes: db.datos.ventas
            .filter(({ venta }) => venta.vendedorId === vendedorId && venta.periodo.equals(periodo))
            .map(({ venta }) => venta.numeroOrden),
        });
      },
      guardar: async (cuenta) => {
        const otras = db.datos.cuentas.filter(
          (c) => !(c.vendedorId === cuenta.vendedorId && c.periodo === cuenta.periodo.codigo),
        );
        db.datos.cuentas = [
          ...otras,
          {
            vendedorId: cuenta.vendedorId,
            periodo: cuenta.periodo.codigo,
            totalNeto: cuenta.valorTotalNeto,
            pagado: cuenta.valorPagado,
          },
        ];
      },
      listar: async (f) =>
        db.datos.cuentas
          .map((c) => {
            const saldo = c.totalNeto.subtract(c.pagado);
            const estado: 'PENDIENTE' | 'PAGADO' =
              c.totalNeto.isPositive() && saldo.isZero() ? 'PAGADO' : 'PENDIENTE';
            return {
              vendedorId: c.vendedorId,
              periodo: c.periodo,
              totalNeto: c.totalNeto.toString(),
              valorPagado: c.pagado.toString(),
              saldoPendiente: saldo.toString(),
              estado,
            };
          })
          .filter(
            (c) =>
              (!f.periodo || c.periodo === f.periodo) &&
              (!f.estado || c.estado === f.estado) &&
              (!f.vendedorId || c.vendedorId === f.vendedorId),
          )
          .sort(
            (a, b) =>
              b.periodo.localeCompare(a.periodo) || a.vendedorId.localeCompare(b.vendedorId),
          ),
    },
  };
}

/** UnitOfWork en memoria: si el trabajo falla, restaura el estado anterior (rollback). */
export function crearBaseEnMemoria() {
  const db = { datos: vacio() };
  const repos = repositorios(db);
  const uow: UnitOfWork = {
    async run(work) {
      const antes = copiar(db.datos);
      try {
        return await work(repos);
      } catch (e) {
        db.datos = antes;
        throw e;
      }
    },
  };
  return { db, repos, uow };
}

/** Comisión GLOBAL vigente desde 2026-01-01 (igual que el seed 010). */
export function comisionGlobal(porcentaje = '10', vigenteDesde = '2026-01-01') {
  return ConfiguracionComision.crear({
    id: `c-${porcentaje}-${vigenteDesde}`,
    porcentaje: Porcentaje.of(porcentaje),
    alcance: 'GLOBAL',
    vigenteDesde,
    creadoPor: 'seed',
  });
}
