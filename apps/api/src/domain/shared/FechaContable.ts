import { InvalidValueError } from './DomainError';
import { ZONA_HORARIA_CONTABLE } from './Periodo';

/** Día contable en formato AAAA-MM-DD (sin hora). Se compara como string. */
export type FechaContable = string;

const PATRON = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valida que el texto sea una fecha real AAAA-MM-DD (p. ej. rechaza 2026-02-30). */
export function parseFechaContable(texto: string): FechaContable {
  const m = PATRON.exec(texto);
  const fecha = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!fecha || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
    throw new InvalidValueError(`Fecha inválida: ${texto} (formato esperado AAAA-MM-DD)`);
  }
  return texto;
}

/** Día al que pertenece un instante, evaluado en la zona horaria contable. */
export function fechaContable(
  instante: Date,
  zonaHoraria: string = ZONA_HORARIA_CONTABLE,
): FechaContable {
  if (Number.isNaN(instante.getTime())) throw new InvalidValueError('Fecha inválida');
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/** Día calendario anterior (2026-03-01 -> 2026-02-28). */
export function diaAnterior(fecha: FechaContable): FechaContable {
  const d = new Date(`${parseFechaContable(fecha)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
