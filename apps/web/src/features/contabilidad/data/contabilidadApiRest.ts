import type {
  AjusteDto,
  ConfiguracionComisionResponse,
  CuentaPorPagarDto,
  Pagina,
  PeriodosResponse,
  ResumenSaldoVendedorDto,
  VentaDetalleDto,
  VentaDto,
  VigenciaComisionDto,
} from '@contabilidad/contracts';
import type { ApiClient } from '../../../shared/api/client';
import type { AjusteFila, ComisionFila, VigenciaPorcentaje } from '../types';
import type { ContabilidadApi } from './puerto';

/** Máximo que acepta GET /ventas por página. */
const TAMANO_PAGINA = 200;

/** Operación que no se hace desde la interfaz del contador (otro módulo u otra historia). */
export class OperacionNoDisponibleError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'OperacionNoDisponibleError';
  }
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
  const texto = q.toString();
  return texto ? `?${texto}` : '';
}

function aComisionFila(v: VentaDto): ComisionFila {
  return {
    id: v.id,
    numeroOrden: v.numeroOrden,
    vendedorId: v.vendedorId,
    vendedorNombre: v.vendedorNombre,
    periodo: v.periodo,
    fecha: v.fechaContable,
    valorBruto: v.valorBruto,
    porcentajeAplicado: v.porcentajeAplicado ?? '0',
    comision: v.comision ?? '0.00',
    valorNeto: v.valorNeto ?? '0.00',
  };
}

function aAjusteFila(a: AjusteDto): AjusteFila {
  return {
    id: a.id,
    tipo: a.tipo,
    motivo: a.motivo,
    fechaContable: a.fechaContable,
    valor: a.valor,
    comisionRevertida: a.comisionRevertida,
    netoRevertido: a.netoRevertido,
    saldoAFavor: a.saldoAFavor,
    origen: a.origen,
    registradoPor: a.registradoPor,
  };
}

function aVigencia(v: VigenciaComisionDto): VigenciaPorcentaje {
  return {
    desde: v.vigenteDesde,
    hasta: v.vigenteHasta,
    porcentaje: v.porcentaje,
    creadoPor: v.creadoPor,
  };
}

/**
 * Implementación del puerto ContabilidadApi sobre la API REST del módulo
 * (/api/v1/contabilidad). Reemplaza al almacén en memoria cuando hay backend.
 */
export function crearContabilidadApiRest(api: ApiClient): ContabilidadApi {
  return {
    async listarPeriodos() {
      return (await api.get<PeriodosResponse>('/periodos')).periodos;
    },

    async listarVigencias() {
      const estado = await api.get<ConfiguracionComisionResponse>('/comisiones/configuracion');
      return estado.historial.map(aVigencia);
    },

    async configurarPorcentaje(vigencia) {
      const estado = await api.put<ConfiguracionComisionResponse>('/comisiones/configuracion', {
        porcentaje: vigencia.porcentaje,
        vigenteDesde: vigencia.desde,
      });
      const nueva = estado.historial.find((v) => v.vigenteDesde === vigencia.desde);
      return nueva ? aVigencia(nueva) : vigencia;
    },

    async registrarVenta() {
      throw new OperacionNoDisponibleError(
        'Las ventas se registran automáticamente cuando el módulo de Órdenes confirma una orden.',
      );
    },

    async listarComisiones(periodo, vendedorId) {
      const filas: ComisionFila[] = [];
      for (let page = 1; ; page++) {
        const pagina = await api.get<Pagina<VentaDto>>(
          `/ventas${query({ periodo, vendedorId, page: String(page), size: String(TAMANO_PAGINA) })}`,
        );
        filas.push(...pagina.items.map(aComisionFila));
        if (filas.length >= pagina.total || pagina.items.length === 0) break;
      }
      return filas.sort(
        (a, b) => a.fecha.localeCompare(b.fecha) || a.numeroOrden.localeCompare(b.numeroOrden),
      );
    },

    async obtenerVenta(id) {
      const v = await api.get<VentaDetalleDto>(`/ventas/${encodeURIComponent(id)}`);
      return { ...aComisionFila(v), estadoOrigen: v.estadoOrigen, registradoEn: v.registradoEn };
    },

    async listarCuentasPorPagar({ periodo, estado }) {
      return api.get<CuentaPorPagarDto[]>(`/cuentas-por-pagar${query({ periodo, estado })}`);
    },

    async resumirPorVendedor(periodo) {
      return api.get<ResumenSaldoVendedorDto[]>(`/cuentas-por-pagar/resumen${query({ periodo })}`);
    },

    async listarAjustes(ventaId) {
      const pagina = await api.get<Pagina<AjusteDto>>(
        `/ajustes${query({ ventaId, size: String(TAMANO_PAGINA) })}`,
      );
      return pagina.items.map(aAjusteFila);
    },

    async registrarAjuste(ajuste) {
      return aAjusteFila(await api.post<AjusteDto>('/ajustes', ajuste));
    },

    async registrarPago() {
      throw new OperacionNoDisponibleError(
        'El registro de pagos a vendedores llega con la HU-CON-10.',
      );
    },
  };
}
