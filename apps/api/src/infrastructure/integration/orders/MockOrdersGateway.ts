import { randomInt, randomUUID } from 'node:crypto';
import type { OrdenConfirmadaEvent } from '@contabilidad/contracts';

export interface OpcionesOrdenSimulada {
  numeroOrden?: string;
  /** Un vendedor por línea (órdenes multi-vendedor, D-05). */
  vendedores?: string[];
  /** Por defecto CONFIRMADA; otro valor sirve para probar el caso IGNORADO. */
  estado?: string;
  fecha?: Date;
  /** Valor bruto por vendedor; si falta, uno aleatorio entre 10.000 y 500.000. */
  valores?: string[];
}

/** Fecha ISO con el desfase de Colombia (-05:00), como la enviaría el módulo de Órdenes. */
function isoColombia(fecha: Date): string {
  const local = new Date(fecha.getTime() - 5 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}-05:00`;
}

/**
 * Simula al módulo de Órdenes mientras su integración no está disponible
 * (INTEGRATION_MODE=mock; riesgo "retraso del módulo de Órdenes"). Genera eventos
 * orden.confirmada que cumplen el contrato v1; los usa el simulador
 * (npm run simular:orden) y las pruebas.
 */
export class MockOrdersGateway {
  constructor(private readonly ahora: () => Date = () => new Date()) {}

  generarOrdenConfirmada(opciones: OpcionesOrdenSimulada = {}): OrdenConfirmadaEvent {
    const fecha = opciones.fecha ?? this.ahora();
    const vendedores = opciones.vendedores ?? [`V-${randomInt(1, 6)}`];
    return {
      eventId: `evt-${randomUUID()}`,
      version: 1,
      ocurridoEn: isoColombia(this.ahora()),
      tipo: 'orden.confirmada',
      numeroOrden: opciones.numeroOrden ?? `ORD-${randomInt(100_000, 1_000_000)}`,
      fecha: isoColombia(fecha),
      estado: opciones.estado ?? 'CONFIRMADA',
      moneda: 'COP',
      lineas: vendedores.map((vendedorId, i) => ({
        vendedorId,
        valorBruto: opciones.valores?.[i] ?? `${randomInt(10, 501) * 1000}.00`,
      })),
    };
  }
}
