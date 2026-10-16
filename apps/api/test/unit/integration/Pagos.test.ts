import { pagoRecibidoSchema } from '@contabilidad/contracts';
import { describe, expect, it } from 'vitest';
import {
  CsvInvalidoError,
  leerCsvPagos,
} from '../../../src/infrastructure/integration/payments/CsvPaymentsImporter';
import { MockPaymentsGateway } from '../../../src/infrastructure/integration/payments/MockPaymentsGateway';

describe('MockPaymentsGateway', () => {
  const gateway = new MockPaymentsGateway(() => new Date('2026-10-16T15:00:00Z'));

  it('genera eventos que cumplen el contrato pago.recibido v1', () => {
    for (let i = 0; i < 20; i++) {
      expect(pagoRecibidoSchema.safeParse(gateway.generarPagoRecibido()).success).toBe(true);
    }
    const conOrdenes = gateway.generarPagoRecibido({ valor: '150000.00', ordenes: ['ORD-1'] });
    expect(pagoRecibidoSchema.safeParse(conOrdenes).success).toBe(true);
    expect(conOrdenes).toMatchObject({
      valor: '150000.00',
      ordenes: ['ORD-1'],
      fecha: '2026-10-16T10:00:00-05:00',
    });
  });
});

describe('leerCsvPagos', () => {
  it('lee las filas, las órdenes separadas por ";" y fechas con o sin hora', () => {
    const filas = leerCsvPagos(
      [
        'referencia,fecha,valor,ordenes',
        'PSE-1,2026-10-16,150000.00,ORD-1;ORD-2',
        '"PSE-2", 2026-10-16T10:30:00-05:00 ,95000,',
        '',
      ].join('\r\n'),
    );
    expect(filas).toEqual([
      {
        linea: 2,
        referencia: 'PSE-1',
        fecha: new Date('2026-10-16T05:00:00Z'),
        valor: '150000.00',
        ordenes: ['ORD-1', 'ORD-2'],
      },
      {
        linea: 3,
        referencia: 'PSE-2',
        fecha: new Date('2026-10-16T15:30:00Z'),
        valor: '95000',
        ordenes: [],
      },
    ]);
  });

  it('marca las filas inválidas sin detener la lectura', () => {
    const filas = leerCsvPagos(
      [
        'referencia,fecha,valor,ordenes',
        ',2026-10-16,1,',
        'PSE-2,16/10/2026,1,',
        'PSE-3,2026-10-16,-5,',
        'PSE-4,2026-10-16,1.234,',
        'PSE-5,2026-10-16,1,ORD-1,extra',
      ].join('\n'),
    );
    expect(filas.map((f) => ('error' in f ? [f.linea, f.error.split(':')[0]] : f.linea))).toEqual([
      [2, 'La referencia es obligatoria'],
      [3, 'Fecha inválida'],
      [4, 'Valor inválido'],
      [5, 'Valor inválido'],
      [6, 'La fila tiene más columnas de las esperadas'],
    ]);
  });

  it('acepta el BOM que agrega Excel al guardar como CSV UTF-8', () => {
    const bom = String.fromCharCode(0xfeff);
    const filas = leerCsvPagos(`${bom}referencia,fecha,valor,ordenes\nPSE-1,2026-10-16,10,`);
    expect(filas).toHaveLength(1);
  });

  it('rechaza un encabezado distinto o un archivo vacío', () => {
    expect(() => leerCsvPagos('ref,fecha,valor\nPSE-1,2026-10-16,1')).toThrow(CsvInvalidoError);
    expect(() => leerCsvPagos('referencia,fecha,valor,ordenes\n')).toThrow(CsvInvalidoError);
  });
});
