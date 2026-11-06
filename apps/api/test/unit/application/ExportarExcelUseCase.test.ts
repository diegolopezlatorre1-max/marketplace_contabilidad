import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { RegistrarAjusteUseCase } from '../../../src/application/commands/RegistrarAjusteUseCase';
import { RegistrarPagoVendedorUseCase } from '../../../src/application/commands/RegistrarPagoVendedorUseCase';
import { RegistrarVentaConfirmadaUseCase } from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import { ExportarExcelUseCase } from '../../../src/application/queries/ExportarExcelUseCase';
import { ReporteIngresosQuery } from '../../../src/application/queries/ReporteIngresosQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { ExcelJsExporter } from '../../../src/infrastructure/integration/spreadsheet/ExcelJsExporter';
import { MockSellersGateway } from '../../../src/infrastructure/integration/sellers/MockSellersGateway';
import { comisionGlobal, crearBaseEnMemoria } from './enMemoria';

const sistema: Actor = { id: 'sistema-marketplace', nombre: 'Órdenes', roles: ['SISTEMA'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
const admin: Actor = { id: 'u-admin', nombre: 'Admin', roles: ['ADMIN_FINANCIERO'] };
const reloj = { now: () => new Date('2026-11-10T15:00:00Z') };

/** Ventas de V-1 (100.000 y 50.000,25) y V-2 (80.000), un pago y una devolución. */
async function entorno() {
  const base = crearBaseEnMemoria();
  base.db.datos.configuraciones.push(comisionGlobal('10'));
  let n = 0;
  const id = () => `id-${++n}`;
  const registrarVenta = new RegistrarVentaConfirmadaUseCase(base.uow, reloj, id);
  for (const [orden, vendedorId, fecha, valor] of [
    ['ORD-1', 'V-1', '2026-10-05T09:00:00-05:00', '100000.00'],
    ['ORD-2', 'V-1', '2026-10-20T09:00:00-05:00', '50000.25'],
    ['ORD-3', 'V-2', '2026-10-21T09:00:00-05:00', '80000.00'],
  ] as const) {
    await registrarVenta.execute(
      {
        eventId: `evt-${orden}`,
        tipo: 'orden.confirmada',
        numeroOrden: orden,
        fecha,
        estado: 'CONFIRMADA',
        lineas: [{ vendedorId, valorBruto: valor }],
      },
      { actor: sistema },
    );
  }
  await new RegistrarPagoVendedorUseCase(base.uow, reloj, id).execute(
    { vendedorId: 'V-1', valor: '90000.00', referencia: 'TRF-1' },
    { actor: contador },
  );
  const ventaOrd2 = base.db.datos.ventas.find(({ venta }) => venta.numeroOrden === 'ORD-2')!.venta;
  await new RegistrarAjusteUseCase(base.uow, reloj, id).execute(
    {
      ventaId: ventaOrd2.id,
      tipo: 'DEVOLUCION',
      motivo: 'Defectuoso',
      valor: '10000.00',
      fecha: '2026-10-25',
    },
    { actor: contador },
  );
  const reporte = new ReporteIngresosQuery(base.reporte);
  return {
    reporte,
    exportar: new ExportarExcelUseCase(
      reporte,
      base.exportacion,
      new ExcelJsExporter(),
      new MockSellersGateway(),
      reloj,
    ),
  };
}

async function leer(contenido: Buffer) {
  const wb = new ExcelJS.Workbook();
  // ExcelJS declara su propio tipo Buffer, incompatible con el de @types/node.
  await wb.xlsx.load(contenido as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

/** Valores de una columna, sin el encabezado ni la fila de totales. */
function columna(ws: ExcelJS.Worksheet, n: number): ExcelJS.CellValue[] {
  const valores: ExcelJS.CellValue[] = [];
  for (let r = 2; r < ws.rowCount; r++) valores.push(ws.getRow(r).getCell(n).value);
  return valores;
}

const centavos = (valores: ExcelJS.CellValue[]) =>
  valores.reduce<number>((acc, v) => acc + Math.round(Number(v) * 100), 0);

describe('ExportarExcelUseCase (HU-CON-08)', () => {
  it('F01: los valores exportados coinciden con el reporte en pantalla', async () => {
    const e = await entorno();
    const filtro = { desde: '2026-10-01', hasta: '2026-10-31' };
    const archivo = await e.exportar.execute(filtro, { actor: admin });
    const pantalla = await e.reporte.execute(filtro, { actor: admin });

    expect(archivo.nombre).toBe('contabilidad_2026-10-01_2026-10-31.xlsx');
    expect(archivo.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const wb = await leer(archivo.contenido);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Ventas', 'Ajustes', 'Resumen', 'Metadatos']);

    const ventas = wb.getWorksheet('Ventas')!;
    expect(centavos(columna(ventas, 5))).toBe(Math.round(Number(pantalla.ventas.valorBruto) * 100));
    expect(centavos(columna(ventas, 7))).toBe(Math.round(Number(pantalla.ventas.comision) * 100));
    expect(centavos(columna(ventas, 8))).toBe(Math.round(Number(pantalla.ventas.valorNeto) * 100));
    const ajustes = wb.getWorksheet('Ajustes')!;
    expect(centavos(columna(ajustes, 6))).toBe(
      Math.round(Number(pantalla.ajustes.valorBruto) * 100),
    );

    // La fila de totales tiene la fórmula y su resultado.
    const total = ventas.getRow(ventas.rowCount);
    expect(total.getCell(1).value).toBe('Total');
    expect(total.getCell(5).value).toMatchObject({ formula: 'SUM(E2:E4)', result: 230000.25 });
  });

  it('escribe las columnas de D-09 con celdas numéricas, no texto', async () => {
    const e = await entorno();
    const wb = await leer(
      (await e.exportar.execute({ desde: '2026-10-01', hasta: '2026-10-31' }, { actor: contador }))
        .contenido,
    );
    const ventas = wb.getWorksheet('Ventas')!;
    expect(ventas.getRow(1).values).toEqual([
      undefined,
      'Fecha',
      'Número de orden',
      'Vendedor',
      'Nombre del vendedor',
      'Valor bruto',
      '% comisión',
      'Comisión',
      'Valor neto',
      'Estado de pago',
      'Estado de conciliación',
      'Ajustes',
    ]);
    const fila = (n: number) => ventas.getRow(n).values as ExcelJS.CellValue[];
    expect(fila(2).slice(2)).toEqual([
      'ORD-1',
      'V-1',
      'Artesanías del Valle S.A.S.',
      100000,
      0.1,
      10000,
      90000,
      'Pagado',
      'Sin conciliar',
      0,
    ]);
    expect(fila(3).slice(2, 11)).toEqual([
      'ORD-2',
      'V-1',
      'Artesanías del Valle S.A.S.',
      50000.25,
      0.1,
      5000.03,
      45000.22,
      'Pendiente',
      'Sin conciliar',
    ]);
    expect(fila(3)[11]).toBe(10000);
    expect(ventas.getRow(2).getCell(1).value).toEqual(new Date('2026-10-05T00:00:00Z'));
    expect(ventas.getRow(2).getCell(5).numFmt).toContain('#,##0.00');
    expect(ventas.getRow(2).getCell(6).numFmt).toBe('0.00%');

    const meta = wb.getWorksheet('Metadatos')!;
    const datos = Object.fromEntries(
      [...Array(meta.rowCount - 1).keys()].map((i) => {
        const r = meta.getRow(i + 2);
        return [r.getCell(1).value, r.getCell(2).value];
      }),
    );
    expect(datos).toMatchObject({
      Desde: '2026-10-01',
      Hasta: '2026-10-31',
      Vendedor: 'Todos',
      Usuario: 'u-contador',
      Generado: '2026-11-10T15:00:00.000Z',
    });
  });

  it('filtra por vendedor y un rango vacío deja encabezados y totales en cero', async () => {
    const e = await entorno();
    const v2 = await leer(
      (
        await e.exportar.execute(
          { desde: '2026-10-01', hasta: '2026-10-31', vendedorId: 'V-2' },
          { actor: admin },
        )
      ).contenido,
    );
    expect(columna(v2.getWorksheet('Ventas')!, 2)).toEqual(['ORD-3']);

    const vacio = await e.exportar.execute(
      { desde: '2026-12-01', hasta: '2026-12-31' },
      { actor: admin },
    );
    const ventas = (await leer(vacio.contenido)).getWorksheet('Ventas')!;
    expect(ventas.rowCount).toBe(2);
    expect(ventas.getRow(2).getCell(5).value).toBe(0);
  });

  it('valida el rango igual que el reporte y exige rol', async () => {
    const e = await entorno();
    await expect(
      e.exportar.execute({ desde: '2026-10-31', hasta: '2026-10-01' }, { actor: admin }),
    ).rejects.toThrow(/posterior/);
    await expect(
      e.exportar.execute({ desde: '2026-10-01', hasta: '2026-10-31' }, { actor: sistema }),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
  });
});
