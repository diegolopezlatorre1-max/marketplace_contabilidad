/** Tipo de dato de una columna: define el formato de la celda (las cifras van como número). */
export type TipoColumna = 'texto' | 'fecha' | 'moneda' | 'porcentaje' | 'entero';

export interface ColumnaHoja {
  titulo: string;
  tipo: TipoColumna;
  /** Ancho aproximado en caracteres. */
  ancho?: number;
  /** Suma la columna en la fila de totales (solo moneda / entero). */
  totalizar?: boolean;
}

/** Valor de una celda: texto, número (moneda como string decimal) o vacío. */
export type ValorCelda = string | number | null;

export interface HojaCalculo {
  nombre: string;
  columnas: ColumnaHoja[];
  filas: ValorCelda[][];
  /** Agrega una fila "Total" con la suma de las columnas marcadas. */
  conTotales?: boolean;
}

export interface LibroCalculo {
  hojas: HojaCalculo[];
  /** Hoja de metadatos (rango, fecha de generación, usuario...). */
  metadatos: Array<[string, string]>;
}

/**
 * Puerto de salida para generar hojas de cálculo (HU-CON-08). Los montos llegan como string
 * decimal y el adaptador los escribe como celdas numéricas con formato de moneda.
 */
export interface SpreadsheetExporter {
  readonly contentType: string;
  readonly extension: string;
  exportar(libro: LibroCalculo): Promise<Buffer>;
}
