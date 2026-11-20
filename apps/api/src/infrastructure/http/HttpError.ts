import type { CodigoError } from '@contabilidad/contracts';

/** Error propio de la capa HTTP (autenticación, recurso no encontrado...). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: CodigoError,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ?? title);
    this.name = 'HttpError';
  }

  static noAutenticado(detail = 'Credenciales ausentes o inválidas'): HttpError {
    return new HttpError(401, 'NO_AUTENTICADO', 'No autenticado', detail);
  }

  static noAutorizado(detail = 'No tiene permisos para realizar esta operación'): HttpError {
    return new HttpError(403, 'NO_AUTORIZADO', 'No autorizado', detail);
  }

  static noEncontrado(detail = 'Recurso no encontrado'): HttpError {
    return new HttpError(404, 'NO_ENCONTRADO', 'No encontrado', detail);
  }
}
