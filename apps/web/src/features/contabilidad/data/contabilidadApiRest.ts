import type {
  ConfiguracionComisionResponse,
  CuentaPorPagarDto,
  Pagina,
  PeriodosResponse,
  VentaDto,
  VigenciaComisionDto,
} from '@contabilidad/contracts';
import type { ApiClient } from '../../../shared/api/client';
import type { ComisionFila, CuentaPorPagarFila, VigenciaPorcentaje } from '../types';
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

// Mientras no exista el SellersGateway (T-23), el nombre del vendedor es su identificador.
const nombreVendedor = (vendedorId: string) => vendedorId;

function aComisionFila(v: VentaDto): ComisionFila {
  return {
    numeroOrden: v.numeroOrden,
    vendedorId: v.vendedorId,
    vendedorNombre: nombreVendedor(v.vendedorId),
    periodo: v.periodo,
    fecha: v.fechaContable,
    valorBruto: v.valorBruto,
    porcentajeAplicado: v.porcentajeAplicado ?? '0',
    comision: v.comision ?? '0.00',
    valorNeto: v.valorNeto ?? '0.00',
  };
}

function aCuentaFila(c: CuentaPorPagarDto): CuentaPorPagarFila {
  return { ...c, vendedorNombre: nombreVendedor(c.vendedorId) };
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

    async listarComisiones(periodo) {
      const filas: ComisionFila[] = [];
      for (let page = 1; ; page++) {
        const pagina = await api.get<Pagina<VentaDto>>(
          `/ventas${query({ periodo, page: String(page), size: String(TAMANO_PAGINA) })}`,
        );
        filas.push(...pagina.items.map(aComisionFila));
        if (filas.length >= pagina.total || pagina.items.length === 0) break;
      }
      return filas.sort(
        (a, b) => a.fecha.localeCompare(b.fecha) || a.numeroOrden.localeCompare(b.numeroOrden),
      );
    },

    async listarCuentasPorPagar({ periodo, estado }) {
      const cuentas = await api.get<CuentaPorPagarDto[]>(
        `/cuentas-por-pagar${query({ periodo, estado })}`,
      );
      return cuentas.map(aCuentaFila);
    },

    async registrarPago() {
      throw new OperacionNoDisponibleError(
        'El registro de pagos a vendedores llega con la HU-CON-10.',
      );
    },
  };
}
