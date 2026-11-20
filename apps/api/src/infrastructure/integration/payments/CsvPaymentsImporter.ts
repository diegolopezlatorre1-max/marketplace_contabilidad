import { montoPositivoSchema } from '@contabilidad/contracts';
import type { FilaPagoImportado } from '../../../application/commands/ImportarPagosRecibidosUseCase';

export const COLUMNAS_CSV_PAGOS = ['referencia', 'fecha', 'valor', 'ordenes'] as const;
export const MAX_FILAS_CSV = 1000;

export class CsvInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'CsvInvalidoError';
  }
}

const quitarComillas = (v: string) =>
  v
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim();

/** Fecha AAAA-MM-DD (se toma el inicio del día en Colombia) o ISO 8601 con zona. */
function leerFecha(texto: string): Date | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T00:00:00-05:00` : texto;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(iso)) return null;
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Lee el archivo de pagos de la pasarela (contrato: referencia,fecha,valor,ordenes;
 * órdenes separadas por ";"). Las filas con error no detienen la lectura: se
 * devuelven con su motivo para el informe de importación.
 */
export function leerCsvPagos(texto: string): FilaPagoImportado[] {
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/);
  const encabezado = (lineas[0] ?? '').split(',').map((c) => quitarComillas(c).toLowerCase());
  if (COLUMNAS_CSV_PAGOS.some((c, i) => encabezado[i] !== c)) {
    throw new CsvInvalidoError(
      `Encabezado inválido: se esperaba "${COLUMNAS_CSV_PAGOS.join(',')}"`,
    );
  }
  const filas: FilaPagoImportado[] = [];
  lineas.slice(1).forEach((contenido, i) => {
    if (!contenido.trim()) return;
    const linea = i + 2;
    const [referencia = '', fechaTexto = '', valor = '', ordenes = '', ...sobrantes] = contenido
      .split(',')
      .map(quitarComillas);
    const ref = referencia || undefined;
    if (sobrantes.some(Boolean)) {
      filas.push({ linea, referencia: ref, error: 'La fila tiene más columnas de las esperadas' });
    } else if (!referencia) {
      filas.push({ linea, error: 'La referencia es obligatoria' });
    } else if (!montoPositivoSchema.safeParse(valor).success) {
      filas.push({ linea, referencia: ref, error: `Valor inválido: "${valor}"` });
    } else {
      const fecha = leerFecha(fechaTexto);
      if (!fecha) {
        filas.push({ linea, referencia: ref, error: `Fecha inválida: "${fechaTexto}"` });
      } else {
        filas.push({
          linea,
          referencia,
          fecha,
          valor,
          ordenes: ordenes
            .split(';')
            .map((o) => o.trim())
            .filter(Boolean),
        });
      }
    }
  });
  if (filas.length === 0) throw new CsvInvalidoError('El archivo no tiene filas de pagos');
  if (filas.length > MAX_FILAS_CSV) {
    throw new CsvInvalidoError(`El archivo supera el máximo de ${MAX_FILAS_CSV} filas`);
  }
  return filas;
}
