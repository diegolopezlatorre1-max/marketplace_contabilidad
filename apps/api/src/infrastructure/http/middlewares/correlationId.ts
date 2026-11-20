import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { setCorrelationId } from '../requestContext';

const HEADER = 'x-correlation-id';
const VALIDO = /^[A-Za-z0-9._-]{1,100}$/;

/** Propaga el correlation-id recibido del marketplace o genera uno nuevo. */
export const correlationId: RequestHandler = (req, res, next) => {
  const recibido = req.header(HEADER);
  const id = recibido && VALIDO.test(recibido) ? recibido : randomUUID();
  setCorrelationId(res, id);
  res.setHeader(HEADER, id);
  next();
};
