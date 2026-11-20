import { DomainError, InvalidValueError } from '../shared/DomainError';
import { diaAnterior, parseFechaContable, type FechaContable } from '../shared/FechaContable';
import type { Porcentaje } from '../shared/Porcentaje';

/**
 * Alcance de una configuración de comisión (decisión D-04). En el Sprint 1 solo
 * se configura GLOBAL; VENDEDOR y CATEGORIA quedan soportados por el modelo.
 * Prioridad al resolver: VENDEDOR > CATEGORIA > GLOBAL.
 */
export const ALCANCES_COMISION = ['GLOBAL', 'VENDEDOR', 'CATEGORIA'] as const;
export type AlcanceComision = (typeof ALCANCES_COMISION)[number];

export interface ConfiguracionComisionProps {
  id: string;
  porcentaje: Porcentaje;
  alcance: AlcanceComision;
  /** Vendedor o categoría; null en GLOBAL. */
  referenciaId: string | null;
  vigenteDesde: FechaContable;
  /** Último día de vigencia (inclusive); null = vigencia abierta. */
  vigenteHasta: FechaContable | null;
  creadoPor: string;
}

export type CrearConfiguracionComision = Omit<
  ConfiguracionComisionProps,
  'vigenteHasta' | 'referenciaId'
> & { referenciaId?: string | null };

/** No existe un porcentaje vigente para la fecha de la venta. */
export class ComisionNoConfiguradaError extends DomainError {
  constructor(fecha: FechaContable) {
    super('COMISION_NO_CONFIGURADA', `No hay porcentaje de comisión vigente para ${fecha}`);
    this.name = 'ComisionNoConfiguradaError';
  }
}

/** Porcentaje de comisión con su periodo de vigencia (HU-CON-09). Inmutable. */
export class ConfiguracionComision {
  private constructor(private readonly props: ConfiguracionComisionProps) {}

  /** Nueva vigencia (abierta). */
  static crear(datos: CrearConfiguracionComision): ConfiguracionComision {
    return ConfiguracionComision.reconstituir({
      ...datos,
      referenciaId: datos.referenciaId ?? null,
      vigenteHasta: null,
    });
  }

  /** Reconstruye una configuración persistida validando sus invariantes. */
  static reconstituir(props: ConfiguracionComisionProps): ConfiguracionComision {
    if (!ALCANCES_COMISION.includes(props.alcance)) {
      throw new InvalidValueError(`Alcance de comisión inválido: ${String(props.alcance)}`);
    }
    if (props.alcance === 'GLOBAL' && props.referenciaId !== null) {
      throw new InvalidValueError('La comisión GLOBAL no admite referencia');
    }
    if (props.alcance !== 'GLOBAL' && !props.referenciaId) {
      throw new InvalidValueError(`La comisión por ${props.alcance} exige una referencia`);
    }
    parseFechaContable(props.vigenteDesde);
    if (props.vigenteHasta !== null) {
      parseFechaContable(props.vigenteHasta);
      if (props.vigenteHasta < props.vigenteDesde) {
        throw new InvalidValueError('La vigencia no puede terminar antes de empezar');
      }
    }
    return new ConfiguracionComision({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get porcentaje(): Porcentaje {
    return this.props.porcentaje;
  }
  get alcance(): AlcanceComision {
    return this.props.alcance;
  }
  get referenciaId(): string | null {
    return this.props.referenciaId;
  }
  get vigenteDesde(): FechaContable {
    return this.props.vigenteDesde;
  }
  get vigenteHasta(): FechaContable | null {
    return this.props.vigenteHasta;
  }
  get creadoPor(): string {
    return this.props.creadoPor;
  }

  get abierta(): boolean {
    return this.props.vigenteHasta === null;
  }

  /** ¿La configuración aplica en esa fecha? (ambos extremos inclusive). */
  cubre(fecha: FechaContable): boolean {
    return (
      fecha >= this.props.vigenteDesde &&
      (this.props.vigenteHasta === null || fecha <= this.props.vigenteHasta)
    );
  }

  /**
   * Cierra la vigencia el día anterior al inicio de la siguiente. La nueva debe
   * empezar después del inicio de esta: si no, las vigencias se solaparían.
   */
  cerrarEn(inicioSiguiente: FechaContable): ConfiguracionComision {
    if (!this.abierta) {
      throw new DomainError('CONFLICTO', 'La vigencia ya está cerrada');
    }
    if (parseFechaContable(inicioSiguiente) <= this.props.vigenteDesde) {
      throw new DomainError(
        'CONFLICTO',
        `La nueva vigencia debe empezar después del ${this.props.vigenteDesde}, ` +
          'inicio de la vigencia actual',
      );
    }
    return new ConfiguracionComision({ ...this.props, vigenteHasta: diaAnterior(inicioSiguiente) });
  }

  toJSON() {
    return {
      id: this.props.id,
      porcentaje: this.props.porcentaje.toString(),
      alcance: this.props.alcance,
      referenciaId: this.props.referenciaId,
      vigenteDesde: this.props.vigenteDesde,
      vigenteHasta: this.props.vigenteHasta,
      creadoPor: this.props.creadoPor,
    };
  }
}

/**
 * Configuración que aplica a una venta en una fecha, con prioridad
 * VENDEDOR > CATEGORIA > GLOBAL. Undefined si ninguna cubre la fecha.
 */
export function seleccionarVigente(
  configs: readonly ConfiguracionComision[],
  fecha: FechaContable,
  vendedorId: string,
  categoriaId?: string,
): ConfiguracionComision | undefined {
  const vigentes = configs.filter((c) => c.cubre(fecha));
  return (
    vigentes.find((c) => c.alcance === 'VENDEDOR' && c.referenciaId === vendedorId) ??
    (categoriaId
      ? vigentes.find((c) => c.alcance === 'CATEGORIA' && c.referenciaId === categoriaId)
      : undefined) ??
    vigentes.find((c) => c.alcance === 'GLOBAL')
  );
}
