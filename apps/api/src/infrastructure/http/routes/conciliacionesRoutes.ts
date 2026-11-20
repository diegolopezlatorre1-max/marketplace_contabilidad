import express, { Router } from 'express';
import { z } from 'zod';
import {
  conciliarPagoSchema,
  listarConciliacionesQuerySchema,
  listarPagosRecibidosQuerySchema,
  pagoRecibidoSchema,
  type ConciliacionDto,
  type ImportacionPagosResponse,
  type PagoRecibidoDto,
  type PagoRecibidoProcesadoResponse,
} from '@contabilidad/contracts';
import type { ConciliarPagoUseCase } from '../../../application/commands/ConciliarPagoUseCase';
import type { ImportarPagosRecibidosUseCase } from '../../../application/commands/ImportarPagosRecibidosUseCase';
import type { RegistrarPagoRecibidoUseCase } from '../../../application/commands/RegistrarPagoRecibidoUseCase';
import type {
  ListarConciliacionesQuery,
  ListarPagosRecibidosQuery,
  ObtenerConciliacionQuery,
} from '../../../application/queries/ConciliacionQueries';
import { CsvInvalidoError, leerCsvPagos } from '../../integration/payments/CsvPaymentsImporter';
import { HttpError } from '../HttpError';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

interface Deps {
  registrarPago: RegistrarPagoRecibidoUseCase;
  importarPagos: ImportarPagosRecibidosUseCase;
  conciliarPago: ConciliarPagoUseCase;
  listarPagos: ListarPagosRecibidosQuery;
  listarConciliaciones: ListarConciliacionesQuery;
  obtenerConciliacion: ObtenerConciliacionQuery;
}

const idParamSchema = z.object({ id: z.string().uuid() });
const LECTORES = ['CONTADOR', 'ADMIN_FINANCIERO'] as const;

/** HU-CON-04: pagos recibidos de la pasarela y su conciliación contra órdenes. */
export function conciliacionesRoutes(deps: Deps): Router {
  const router = Router();

  router.post('/eventos/pago-recibido', requireRole('SISTEMA'), async (req, res) => {
    const evento = parse(req, 'body', pagoRecibidoSchema);
    const body: PagoRecibidoProcesadoResponse = await deps.registrarPago.execute(
      evento,
      contexto(res),
    );
    res.status(body.resultado === 'PROCESADO' ? 201 : 200).json(body);
  });

  router.post(
    '/pagos-recibidos/importar',
    requireRole('CONTADOR'),
    express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }),
    async (req, res) => {
      if (typeof req.body !== 'string' || !req.body.trim()) {
        throw new HttpError(
          400,
          'VALIDACION',
          'CSV inválido',
          'Envíe el archivo con Content-Type: text/csv',
        );
      }
      let filas;
      try {
        filas = leerCsvPagos(req.body);
      } catch (error) {
        if (error instanceof CsvInvalidoError) {
          throw new HttpError(400, 'VALIDACION', 'CSV inválido', error.message);
        }
        throw error;
      }
      const body: ImportacionPagosResponse = await deps.importarPagos.execute(
        { filas },
        contexto(res),
      );
      res.json(body);
    },
  );

  router.get('/pagos-recibidos', requireRole(...LECTORES), async (req, res) => {
    const filtro = parse(req, 'query', listarPagosRecibidosQuerySchema);
    const body: PagoRecibidoDto[] = (await deps.listarPagos.execute(filtro, contexto(res))).map(
      (p) => ({ ...p, origen: p.origen as PagoRecibidoDto['origen'] }),
    );
    res.json(body);
  });

  router.post('/conciliaciones', requireRole('CONTADOR'), async (req, res) => {
    const entrada = parse(req, 'body', conciliarPagoSchema);
    const body: ConciliacionDto = await deps.conciliarPago.execute(entrada, contexto(res));
    res.status(201).json(body);
  });

  router.get('/conciliaciones', requireRole(...LECTORES), async (req, res) => {
    const filtro = parse(req, 'query', listarConciliacionesQuerySchema);
    const body: ConciliacionDto[] = await deps.listarConciliaciones.execute(filtro, contexto(res));
    res.json(body);
  });

  router.get('/conciliaciones/:id', requireRole(...LECTORES), async (req, res) => {
    const { id } = parse(req, 'params', idParamSchema);
    const body: ConciliacionDto | null = await deps.obtenerConciliacion.execute(
      { id },
      contexto(res),
    );
    if (!body) throw HttpError.noEncontrado(`No existe la conciliación ${id}`);
    res.json(body);
  });

  return router;
}
