import { randomInt, randomUUID } from 'node:crypto';
import type { PagoRecibidoEvent } from '@contabilidad/contracts';

export interface OpcionesPagoSimulado {
  referencia?: string;
  valor?: string;
  ordenes?: string[];
  fecha?: Date;
  origen?: PagoRecibidoEvent['origen'];
}

/** Fecha ISO con el desfase de Colombia (-05:00). */
function isoColombia(fecha: Date): string {
  const local = new Date(fecha.getTime() - 5 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}-05:00`;
}

/**
 * Simula al módulo de Pagos / pasarela mientras su contrato no está cerrado
 * (INTEGRATION_MODE=mock). Genera eventos pago.recibido que cumplen el contrato v1;
 * los usan el simulador (npm run simular:pago) y las pruebas.
 */
export class MockPaymentsGateway {
  constructor(private readonly ahora: () => Date = () => new Date()) {}

  generarPagoRecibido(opciones: OpcionesPagoSimulado = {}): PagoRecibidoEvent {
    return {
      eventId: `evt-${randomUUID()}`,
      version: 1,
      ocurridoEn: isoColombia(this.ahora()),
      tipo: 'pago.recibido',
      referenciaPasarela: opciones.referencia ?? `PSE-${randomInt(100_000, 1_000_000)}`,
      fecha: isoColombia(opciones.fecha ?? this.ahora()),
      valor: opciones.valor ?? `${randomInt(10, 501) * 1000}.00`,
      moneda: 'COP',
      origen: opciones.origen ?? 'API',
      ...(opciones.ordenes?.length ? { ordenes: opciones.ordenes } : {}),
    };
  }
}
