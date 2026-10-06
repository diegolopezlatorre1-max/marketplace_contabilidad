import type { Request } from 'express';
import type { z } from 'zod';

/**
 * Valida y tipa una parte de la petición. Un ZodError se traduce a 400 en el errorHandler.
 * Uso: const body = parse(req, 'body', ordenConfirmadaSchema);
 */
export function parse<S extends z.ZodTypeAny>(
  req: Request,
  parte: 'body' | 'query' | 'params',
  schema: S,
): z.infer<S> {
  return schema.parse(req[parte]);
}
