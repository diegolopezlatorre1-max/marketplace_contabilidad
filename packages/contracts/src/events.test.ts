import { describe, expect, it } from 'vitest';
import { montoSchema, ordenConfirmadaSchema, pagoRecibidoSchema } from './index';

const ordenValida = {
  eventId: 'evt-001',
  version: 1,
  ocurridoEn: '2026-10-05T10:00:00-05:00',
  tipo: 'orden.confirmada',
  numeroOrden: 'ORD-1001',
  fecha: '2026-10-05T09:58:00-05:00',
  estado: 'CONFIRMADA',
  moneda: 'COP',
  lineas: [
    { vendedorId: 'V-1', valorBruto: '100000.00' },
    { vendedorId: 'V-2', valorBruto: '50000' },
  ],
};

describe('contratos de eventos', () => {
  it('acepta una orden confirmada multi-vendedor', () => {
    expect(ordenConfirmadaSchema.safeParse(ordenValida).success).toBe(true);
  });

  it('rechaza montos como number, con 3 decimales o negativos', () => {
    const conNumber = { ...ordenValida, lineas: [{ vendedorId: 'V-1', valorBruto: 100000 }] };
    const tresDecimales = { ...ordenValida, lineas: [{ vendedorId: 'V-1', valorBruto: '1.001' }] };
    const negativo = { ...ordenValida, lineas: [{ vendedorId: 'V-1', valorBruto: '-5' }] };
    expect(ordenConfirmadaSchema.safeParse(conNumber).success).toBe(false);
    expect(ordenConfirmadaSchema.safeParse(tresDecimales).success).toBe(false);
    expect(ordenConfirmadaSchema.safeParse(negativo).success).toBe(false);
  });

  it('rechaza una orden sin líneas', () => {
    expect(ordenConfirmadaSchema.safeParse({ ...ordenValida, lineas: [] }).success).toBe(false);
  });

  it('rechaza un vendedor repetido en la misma orden (D-05)', () => {
    const repetido = {
      ...ordenValida,
      lineas: [
        { vendedorId: 'V-1', valorBruto: '100.00' },
        { vendedorId: 'V-1', valorBruto: '50.00' },
      ],
    };
    expect(ordenConfirmadaSchema.safeParse(repetido).success).toBe(false);
  });

  it('acepta un pago recibido sin órdenes asociadas', () => {
    const pago = {
      eventId: 'evt-p1',
      version: 1,
      ocurridoEn: '2026-10-05T10:00:00Z',
      tipo: 'pago.recibido',
      referenciaPasarela: 'PSE-889',
      fecha: '2026-10-05T10:00:00Z',
      valor: '150000.00',
      moneda: 'COP',
      origen: 'API',
    };
    expect(pagoRecibidoSchema.safeParse(pago).success).toBe(true);
  });

  it('valida el formato de monto', () => {
    expect(montoSchema.safeParse('0.50').success).toBe(true);
    expect(montoSchema.safeParse('1e5').success).toBe(false);
  });
});
