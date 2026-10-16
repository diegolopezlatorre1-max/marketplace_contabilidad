import { ordenConfirmadaSchema } from '@contabilidad/contracts';
import { describe, expect, it } from 'vitest';
import { MockOrdersGateway } from '../../../src/infrastructure/integration/orders/MockOrdersGateway';

const gateway = new MockOrdersGateway(() => new Date('2026-10-05T15:00:00Z'));

describe('MockOrdersGateway', () => {
  it('genera eventos que cumplen el contrato orden.confirmada v1', () => {
    for (let i = 0; i < 20; i++) {
      expect(ordenConfirmadaSchema.safeParse(gateway.generarOrdenConfirmada()).success).toBe(true);
    }
  });

  it('respeta vendedores, valores, estado y fecha indicados', () => {
    const evento = gateway.generarOrdenConfirmada({
      numeroOrden: 'ORD-1',
      vendedores: ['V-1', 'V-2'],
      valores: ['100000.00'],
      estado: 'PENDIENTE',
      fecha: new Date('2026-10-16T03:00:00Z'),
    });
    expect(evento).toMatchObject({
      numeroOrden: 'ORD-1',
      estado: 'PENDIENTE',
      fecha: '2026-10-15T22:00:00-05:00',
      ocurridoEn: '2026-10-05T10:00:00-05:00',
    });
    expect(evento.lineas[0]).toEqual({ vendedorId: 'V-1', valorBruto: '100000.00' });
    expect(evento.lineas[1]?.vendedorId).toBe('V-2');
  });

  it('genera un eventId distinto en cada evento', () => {
    const a = gateway.generarOrdenConfirmada();
    const b = gateway.generarOrdenConfirmada();
    expect(a.eventId).not.toBe(b.eventId);
  });
});
