import ExcelJS from 'exceljs';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { MockOrdersGateway } from '../../src/infrastructure/integration/orders/MockOrdersGateway';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const BASE = '/api/v1/contabilidad';
const reloj = { now: () => new Date('2026-11-10T15:00:00Z') };
const ordenes = new MockOrdersGateway(reloj.now);

function crearApp() {
  const { router } = createContabilidadModule({
    config: { INTEGRATION_MODE: 'mock', AUTH_MODE: 'mock' },
    pool: testPool(),
    logger,
    overrides: { clock: reloj },
  });
  return createHttpApp({ router, logger, corsOrigins: [] });
}

let appCache: ReturnType<typeof crearApp> | undefined;
const app = () => (appCache ??= crearApp());
const post = (url: string, token: string, body: object) =>
  request(app()).post(`${BASE}${url}`).set('authorization', `Bearer ${token}`).send(body);

/** Descarga el .xlsx como Buffer. */
const descargar = (query: string, token = 'mock-admin') =>
  request(app())
    .get(`${BASE}/exportaciones/excel${query}`)
    .set('authorization', `Bearer ${token}`)
    .buffer(true)
    .parse((res, callback) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => callback(null, Buffer.concat(partes)));
    });

async function venta(numeroOrden: string, vendedorId: string, valor: string, fecha: string) {
  await post(
    '/eventos/orden-confirmada',
    'mock-sistema',
    ordenes.generarOrdenConfirmada({
      numeroOrden,
      vendedores: [vendedorId],
      valores: [valor],
      fecha: new Date(fecha),
    }),
  );
}

beforeEach(async () => {
  await limpiarTablas();
  await testPool().query(
    `INSERT INTO contabilidad.configuracion_comision
       (id, porcentaje, alcance, vigente_desde, creado_por)
     VALUES (gen_random_uuid(), 10, 'GLOBAL', '2026-01-01', 'seed')`,
  );
  await venta('ORD-1', 'V-1', '100000.00', '2026-10-05T14:00:00Z');
  await venta('ORD-2', 'V-1', '50000.25', '2026-10-20T14:00:00Z');
  await venta('ORD-3', 'V-2', '80000.00', '2026-10-21T14:00:00Z');
  // ORD-1 se paga completa por la pasarela; V-1 recibe el pago de su primera quincena.
  await post('/eventos/pago-recibido', 'mock-sistema', {
    eventId: 'evt-pago-1',
    version: 1,
    ocurridoEn: '2026-10-06T10:00:00-05:00',
    tipo: 'pago.recibido',
    referenciaPasarela: 'PSE-1',
    fecha: '2026-10-06T10:00:00-05:00',
    valor: '100000.00',
    moneda: 'COP',
    origen: 'API',
    ordenes: ['ORD-1'],
  });
  await post('/pagos-vendedor', 'mock-contador', {
    vendedorId: 'V-1',
    valor: '90000.00',
    referencia: 'TRF-1',
  });
  const { rows } = await testPool().query<{ id: string }>(
    `SELECT id FROM contabilidad.venta_contable WHERE numero_orden = 'ORD-2'`,
  );
  await post('/ajustes', 'mock-contador', {
    ventaId: rows[0]!.id,
    tipo: 'DEVOLUCION',
    motivo: 'Defectuoso',
    valor: '10000.00',
    fecha: '2026-10-25',
  });
});

async function leer(contenido: Buffer) {
  const wb = new ExcelJS.Workbook();
  // ExcelJS declara su propio tipo Buffer, incompatible con el de @types/node.
  await wb.xlsx.load(contenido as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

const sumaColumna = (ws: ExcelJS.Worksheet, n: number) => {
  let centavos = 0;
  for (let r = 2; r < ws.rowCount; r++) {
    const v = ws.getRow(r).getCell(n).value;
    expect(typeof v, `fila ${r}`).toBe('number');
    centavos += Math.round((v as number) * 100);
  }
  return centavos / 100;
};

describe('HU-CON-08 - criterios de aceptación del F01', () => {
  it('1 y 3. el periodo elegido se exporta con los mismos valores del reporte', async () => {
    const res = await descargar('?desde=2026-10-01&hasta=2026-10-31');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('contabilidad_2026-10-01_2026-10-31.xlsx');

    const pantalla = (
      await request(app())
        .get(`${BASE}/reportes/ingresos?desde=2026-10-01&hasta=2026-10-31`)
        .set('authorization', 'Bearer mock-admin')
    ).body;
    const wb = await leer(res.body as Buffer);
    const ventas = wb.getWorksheet('Ventas')!;
    expect(sumaColumna(ventas, 5)).toBe(Number(pantalla.ventas.valorBruto));
    expect(sumaColumna(ventas, 7)).toBe(Number(pantalla.ventas.comision));
    expect(sumaColumna(ventas, 8)).toBe(Number(pantalla.ventas.valorNeto));
    expect(sumaColumna(wb.getWorksheet('Ajustes')!, 6)).toBe(Number(pantalla.ajustes.valorBruto));
    const resumen = wb.getWorksheet('Resumen')!;
    expect(resumen.getRow(4).values).toEqual([
      undefined,
      'Total (ventas − ajustes)',
      undefined,
      Number(pantalla.totales.valorBruto),
      Number(pantalla.totales.comision),
      Number(pantalla.totales.valorNeto),
    ]);
  });

  it('2. exporta las columnas definidas (D-09) con los estados de pago y conciliación', async () => {
    const wb = await leer((await descargar('?desde=2026-10-01&hasta=2026-10-31')).body as Buffer);
    const ventas = wb.getWorksheet('Ventas')!;
    const filas = [2, 3, 4].map((r) => {
      const c = (n: number) => ventas.getRow(r).getCell(n).value;
      return [c(2), c(3), c(6), c(9), c(10), c(11)];
    });
    expect(filas).toEqual([
      ['ORD-1', 'V-1', 0.1, 'Pagado', 'Conciliada', 0],
      ['ORD-2', 'V-1', 0.1, 'Pendiente', 'Sin conciliar', 10000],
      ['ORD-3', 'V-2', 0.1, 'Pendiente', 'Sin conciliar', 0],
    ]);
  });

  it('filtra por vendedor, valida el rango y exige rol', async () => {
    const v2 = await leer(
      (await descargar('?desde=2026-10-01&hasta=2026-10-31&vendedorId=V-2')).body as Buffer,
    );
    expect(v2.getWorksheet('Ventas')!.rowCount).toBe(3); // encabezado, ORD-3 y total
    expect((await descargar('?desde=2026-10-31&hasta=2026-10-01')).status).toBe(400);
    expect((await descargar('?desde=2026-10-01')).status).toBe(400);
    expect((await descargar('?desde=2026-10-01&hasta=2026-10-31', 'mock-sistema')).status).toBe(
      403,
    );
    expect((await descargar('?desde=2026-10-01&hasta=2026-10-31', 'mock-contador')).status).toBe(
      200,
    );
  });
});
