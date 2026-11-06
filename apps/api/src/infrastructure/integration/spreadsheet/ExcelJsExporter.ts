import ExcelJS from 'exceljs';
import type {
  ColumnaHoja,
  LibroCalculo,
  SpreadsheetExporter,
  ValorCelda,
} from '../../../application/ports/out/SpreadsheetExporter';

const FORMATOS: Record<ColumnaHoja['tipo'], string | undefined> = {
  texto: undefined,
  fecha: 'yyyy-mm-dd',
  moneda: '"$" #,##0.00;[Red]-"$" #,##0.00',
  porcentaje: '0.00%',
  entero: '0',
};

const ENCABEZADO: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } },
  alignment: { vertical: 'middle', wrapText: true },
};

/** Convierte el valor al tipo de la celda: las cifras siempre como número, nunca como texto. */
function celda(valor: ValorCelda, tipo: ColumnaHoja['tipo']): ExcelJS.CellValue {
  if (valor === null || valor === '') return null;
  switch (tipo) {
    case 'moneda':
    case 'entero':
      return Number(valor);
    case 'porcentaje':
      // "10.0000" (%) -> 0.1 con formato 0.00 %.
      return Number(valor) / 100;
    case 'fecha':
      return typeof valor === 'string' ? new Date(`${valor}T00:00:00Z`) : valor;
    default:
      return String(valor);
  }
}

/** Suma exacta en centavos, para el valor guardado junto a la fórmula de totales. */
function sumaCentavos(valores: ValorCelda[]): number {
  let centavos = 0n;
  for (const v of valores) {
    if (v === null || v === '') continue;
    const [entero = '0', decimales = ''] = String(v).replace('-', '').split('.');
    const c = BigInt(entero) * 100n + BigInt((decimales + '00').slice(0, 2));
    centavos += String(v).startsWith('-') ? -c : c;
  }
  return Number(centavos) / 100;
}

const letra = (n: number) => {
  let s = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26))
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

/**
 * HU-CON-08: genera el .xlsx con ExcelJS. Encabezados con estilo, celdas numéricas con formato de
 * moneda, fila de totales con fórmula SUM (y su valor ya calculado) y una hoja de metadatos.
 */
export class ExcelJsExporter implements SpreadsheetExporter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  readonly extension = 'xlsx';

  async exportar(libro: LibroCalculo): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Módulo de Contabilidad - Marketplace';

    for (const hoja of libro.hojas) {
      const ws = wb.addWorksheet(hoja.nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = hoja.columnas.map((c) => ({
        header: c.titulo,
        width: c.ancho ?? 14,
        ...(FORMATOS[c.tipo] ? { style: { numFmt: FORMATOS[c.tipo] } } : {}),
      }));
      ws.getRow(1).eachCell((c) => Object.assign(c, { style: { ...c.style, ...ENCABEZADO } }));
      for (const fila of hoja.filas) {
        ws.addRow(fila.map((v, i) => celda(v, hoja.columnas[i]!.tipo)));
      }

      if (hoja.conTotales) {
        const ultima = hoja.filas.length + 1;
        const totales = ws.addRow(
          hoja.columnas.map((c, i) => {
            if (i === 0) return 'Total';
            if (!c.totalizar) return null;
            // Sin filas no hay rango que sumar: el total es 0.
            if (hoja.filas.length === 0) return 0;
            const col = letra(i + 1);
            return {
              formula: `SUM(${col}2:${col}${ultima})`,
              result: sumaCentavos(hoja.filas.map((f) => f[i] ?? null)),
            };
          }),
        );
        totales.font = { bold: true };
        totales.eachCell((c) => {
          c.border = { top: { style: 'thin' } };
        });
      }
    }

    const meta = wb.addWorksheet('Metadatos');
    meta.columns = [
      { header: 'Dato', width: 14 },
      { header: 'Valor', width: 70 },
    ];
    meta.getRow(1).eachCell((c) => Object.assign(c, { style: { ...c.style, ...ENCABEZADO } }));
    libro.metadatos.forEach(([k, v]) => meta.addRow([k, v]));

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
