import { InvalidValueError } from './DomainError';

/** Zona horaria en la que se determinan los cortes de periodo. */
export const ZONA_HORARIA_CONTABLE = 'America/Bogota';

const PATRON = /^(\d{4})-(0[1-9]|1[0-2])-Q([12])$/;

/**
 * Periodo de liquidación QUINCENAL (decisión por defecto D-03, pendiente de
 * validar con el contador):
 *   Q1 = días 1 a 15, Q2 = día 16 a fin de mes.
 * Código: "2026-10-Q1".
 */
export class Periodo {
  private constructor(
    readonly anio: number,
    readonly mes: number,
    readonly quincena: 1 | 2,
  ) {}

  static parse(codigo: string): Periodo {
    const m = PATRON.exec(codigo);
    if (!m)
      throw new InvalidValueError(`Periodo inválido: ${codigo} (formato esperado AAAA-MM-Q1|Q2)`);
    return new Periodo(Number(m[1]), Number(m[2]), m[3] === '1' ? 1 : 2);
  }

  /** Periodo al que pertenece un instante, evaluado en la zona horaria contable. */
  static fromDate(fecha: Date, zonaHoraria: string = ZONA_HORARIA_CONTABLE): Periodo {
    if (Number.isNaN(fecha.getTime())) throw new InvalidValueError('Fecha inválida');
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(fecha);
    const get = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
    return new Periodo(get('year'), get('month'), get('day') <= 15 ? 1 : 2);
  }

  get codigo(): string {
    return `${this.anio}-${String(this.mes).padStart(2, '0')}-Q${this.quincena}`;
  }

  /** Primer día del periodo (AAAA-MM-DD, fecha local contable). */
  get fechaInicio(): string {
    return this.fecha(this.quincena === 1 ? 1 : 16);
  }

  /** Último día del periodo (AAAA-MM-DD, inclusive). */
  get fechaFin(): string {
    const ultimoDiaMes = new Date(Date.UTC(this.anio, this.mes, 0)).getUTCDate();
    return this.fecha(this.quincena === 1 ? 15 : ultimoDiaMes);
  }

  siguiente(): Periodo {
    if (this.quincena === 1) return new Periodo(this.anio, this.mes, 2);
    return this.mes === 12
      ? new Periodo(this.anio + 1, 1, 1)
      : new Periodo(this.anio, this.mes + 1, 1);
  }

  equals(otro: Periodo): boolean {
    return this.codigo === otro.codigo;
  }

  toString(): string {
    return this.codigo;
  }

  toJSON(): string {
    return this.codigo;
  }

  private fecha(dia: number): string {
    return `${this.anio}-${String(this.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
}
