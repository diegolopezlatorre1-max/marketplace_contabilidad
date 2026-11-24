import { describe, expect, it } from 'vitest';
import { EscrowPedido, HORAS_RETENCION } from '../../../src/domain/escrow/EscrowPedido';
import { InvalidValueError } from '../../../src/domain/shared';

const ahora = new Date('2026-11-10T15:00:00Z');
const horas = (h: number) => new Date(ahora.getTime() + h * 3_600_000);

describe('EscrowPedido', () => {
  it('la entrega inicia una retención de 72 h; después queda LIBERADO', () => {
    const e = EscrowPedido.nuevo('ORD-1', ahora);
    expect(e.estado(ahora)).toBe('SIN_ENTREGA');
    expect(e.marcarEntrega(ahora, ahora)).toBe(true);
    expect(HORAS_RETENCION).toBe(72);
    expect(e.toJSON(ahora)).toMatchObject({
      estado: 'RETENIDO',
      entregadoEn: '2026-11-10T15:00:00.000Z',
      liberableDesde: '2026-11-13T15:00:00.000Z',
    });
    expect(e.retieneElPago(horas(71.9))).toBe(true);
    expect(e.estado(horas(72))).toBe('LIBERADO');
    expect(e.retieneElPago(horas(72))).toBe(false);
  });

  it('marcar la entrega dos veces no reinicia el plazo', () => {
    const e = EscrowPedido.nuevo('ORD-1', ahora);
    e.marcarEntrega(horas(-10), ahora);
    expect(e.marcarEntrega(ahora, ahora)).toBe(false);
    expect(e.datos.entregadoEn).toEqual(horas(-10));
  });

  it('el bloqueo por PQR retiene el pago aunque hayan pasado las 72 h', () => {
    const e = EscrowPedido.nuevo('ORD-1', ahora);
    e.marcarEntrega(horas(-100), ahora);
    expect(e.estado(ahora)).toBe('LIBERADO');
    expect(e.bloquear('  PQR-77  ', ahora)).toBe(true);
    expect(e.bloquear('otra', ahora)).toBe(false);
    expect(e.toJSON(ahora)).toMatchObject({ estado: 'BLOQUEADO', motivoBloqueo: 'PQR-77' });
    expect(e.retieneElPago(ahora)).toBe(true);
  });

  it('al desbloquear vuelve a la retención original (o queda LIBERADO si ya pasó)', () => {
    const reciente = EscrowPedido.nuevo('ORD-1', ahora);
    reciente.marcarEntrega(horas(-10), ahora);
    reciente.bloquear(undefined, ahora);
    expect(reciente.desbloquear(ahora)).toBe(true);
    expect(reciente.estado(ahora)).toBe('RETENIDO');
    expect(reciente.desbloquear(ahora)).toBe(false);

    const antiguo = EscrowPedido.nuevo('ORD-2', ahora);
    antiguo.marcarEntrega(horas(-100), ahora);
    antiguo.bloquear('PQR', ahora);
    antiguo.desbloquear(ahora);
    expect(antiguo.toJSON(ahora)).toMatchObject({
      estado: 'LIBERADO',
      bloqueado: false,
      motivoBloqueo: null,
    });
  });

  it('sin entrega retiene el pago; también se puede bloquear antes de entregar', () => {
    const e = EscrowPedido.nuevo('ORD-1', ahora);
    expect(e.estado(ahora)).toBe('SIN_ENTREGA');
    expect(e.retieneElPago(ahora)).toBe(true);
    e.bloquear('PQR', ahora);
    expect(e.estado(ahora)).toBe('BLOQUEADO');
    e.desbloquear(ahora);
    expect(e.estado(ahora)).toBe('SIN_ENTREGA');
    expect(e.retieneElPago(ahora)).toBe(true);
  });

  it('valida el pedido, la fecha de entrega y el motivo', () => {
    expect(() => EscrowPedido.nuevo('  ', ahora)).toThrow(InvalidValueError);
    expect(() => EscrowPedido.nuevo('x'.repeat(65), ahora)).toThrow(/64/);
    const e = EscrowPedido.nuevo('ORD-1', ahora);
    expect(() => e.marcarEntrega(horas(1), ahora)).toThrow(/futura/);
    expect(() => e.marcarEntrega(new Date('x'), ahora)).toThrow(/inválida/);
    expect(() => e.bloquear('x'.repeat(501), ahora)).toThrow(/500/);
  });
});
