import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../../../shared/api/client';
import { crearContabilidadApiRest, OperacionNoDisponibleError } from './contabilidadApiRest';

function respuesta(status: number, body: unknown, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

/** Responde según la URL pedida y registra cada llamada. */
function crear(rutas: Record<string, { status?: number; body: unknown }>) {
  const fetchFn = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const ruta = rutas[url];
    if (!ruta)
      return respuesta(404, { title: `Sin ruta ${url}`, status: 404, code: 'NO_ENCONTRADO' });
    return respuesta(ruta.status ?? 200, ruta.body);
  });
  const api = createApiClient({ baseUrl: '/api', getToken: () => 'mock-contador', fetchFn });
  return { fetchFn, contabilidad: crearContabilidadApiRest(api) };
}

const venta = (numeroOrden: string, fechaContable: string) => ({
  id: `id-${numeroOrden}`,
  numeroOrden,
  vendedorId: 'V-1',
  categoriaId: null,
  fecha: `${fechaContable}T15:00:00.000Z`,
  fechaContable,
  periodo: '2026-10-Q1',
  valorBruto: '100000.00',
  porcentajeAplicado: '10.0000',
  comision: '10000.00',
  valorNeto: '90000.00',
});

describe('crearContabilidadApiRest', () => {
  it('lista periodos', async () => {
    const { contabilidad } = crear({ '/api/periodos': { body: { periodos: ['2026-10-Q2'] } } });
    await expect(contabilidad.listarPeriodos()).resolves.toEqual(['2026-10-Q2']);
  });

  it('lista comisiones del periodo recorriendo todas las páginas', async () => {
    const { contabilidad, fetchFn } = crear({
      '/api/ventas?periodo=2026-10-Q1&page=1&size=200': {
        body: { items: [venta('ORD-2', '2026-10-05')], page: 1, size: 200, total: 2 },
      },
      '/api/ventas?periodo=2026-10-Q1&page=2&size=200': {
        body: { items: [venta('ORD-1', '2026-10-03')], page: 2, size: 200, total: 2 },
      },
    });
    const filas = await contabilidad.listarComisiones('2026-10-Q1');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(filas.map((f) => f.numeroOrden)).toEqual(['ORD-1', 'ORD-2']);
    expect(filas[0]).toEqual({
      numeroOrden: 'ORD-1',
      vendedorId: 'V-1',
      vendedorNombre: 'V-1',
      periodo: '2026-10-Q1',
      fecha: '2026-10-03',
      valorBruto: '100000.00',
      porcentajeAplicado: '10.0000',
      comision: '10000.00',
      valorNeto: '90000.00',
    });
  });

  it('lista cuentas por pagar con filtros', async () => {
    const cuenta = {
      vendedorId: 'V-1',
      periodo: '2026-10-Q1',
      totalNeto: '90000.00',
      valorPagado: '0.00',
      saldoPendiente: '90000.00',
      estado: 'PENDIENTE',
    };
    const { contabilidad } = crear({
      '/api/cuentas-por-pagar?periodo=2026-10-Q1&estado=PENDIENTE': { body: [cuenta] },
    });
    await expect(
      contabilidad.listarCuentasPorPagar({ periodo: '2026-10-Q1', estado: 'PENDIENTE' }),
    ).resolves.toEqual([{ ...cuenta, vendedorNombre: 'V-1' }]);
  });

  it('lee y configura vigencias del porcentaje', async () => {
    const historial = [
      {
        id: 'b',
        porcentaje: '12.0000',
        alcance: 'GLOBAL',
        referenciaId: null,
        vigenteDesde: '2026-10-16',
        vigenteHasta: null,
        creadoPor: 'u-admin',
      },
      {
        id: 'a',
        porcentaje: '10.0000',
        alcance: 'GLOBAL',
        referenciaId: null,
        vigenteDesde: '2026-01-01',
        vigenteHasta: '2026-10-15',
        creadoPor: 'seed',
      },
    ];
    const { contabilidad, fetchFn } = crear({
      '/api/comisiones/configuracion': {
        body: { fecha: '2026-10-16', vigente: historial[0], historial },
      },
    });
    const vigencias = await contabilidad.listarVigencias();
    expect(vigencias[1]).toEqual({
      desde: '2026-01-01',
      hasta: '2026-10-15',
      porcentaje: '10.0000',
      creadoPor: 'seed',
    });

    const nueva = await contabilidad.configurarPorcentaje({
      desde: '2026-10-16',
      porcentaje: '12',
    });
    expect(nueva).toMatchObject({ desde: '2026-10-16', porcentaje: '12.0000', hasta: null });
    const [, opciones] = fetchFn.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(opciones.method).toBe('PUT');
    expect(JSON.parse(String(opciones.body))).toEqual({
      porcentaje: '12',
      vigenteDesde: '2026-10-16',
    });
  });

  it('propaga el error de la API con su detalle', async () => {
    const { contabilidad } = crear({
      '/api/comisiones/configuracion': {
        status: 409,
        body: { title: 'Regla', status: 409, code: 'CONFLICTO', detail: 'Se solapa' },
      },
    });
    const error = await contabilidad
      .configurarPorcentaje({ desde: '2026-01-01', porcentaje: '12' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Se solapa');
  });

  it('no permite registrar ventas ni pagos desde la interfaz', async () => {
    const { contabilidad } = crear({});
    await expect(
      contabilidad.registrarVenta({
        numeroOrden: 'X',
        vendedorId: 'V',
        vendedorNombre: 'V',
        fecha: '2026-10-01',
        valorBruto: '1',
      }),
    ).rejects.toThrow(OperacionNoDisponibleError);
    await expect(
      contabilidad.registrarPago({ vendedorId: 'V', periodo: '2026-10-Q1', valor: '1' }),
    ).rejects.toThrow(OperacionNoDisponibleError);
  });
});
