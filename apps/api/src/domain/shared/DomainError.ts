/**
 * Error de regla de negocio. La capa HTTP lo traduce a 422 (o al estado que
 * corresponda según el código) sin que el dominio conozca HTTP.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Valor inválido al construir un value object (monto, porcentaje, periodo...). */
export class InvalidValueError extends DomainError {
  constructor(message: string) {
    super('VALOR_INVALIDO', message);
    this.name = 'InvalidValueError';
  }
}
