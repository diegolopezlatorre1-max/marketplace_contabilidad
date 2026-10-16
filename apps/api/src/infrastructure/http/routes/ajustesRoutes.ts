import { Router, type Response } from 'express';
import {
  listarAjustesQuerySchema,
  ordenCanceladaSchema,
  ordenDevueltaSchema,
  registrarAjusteSchema,
  type AjusteDto,
  type EventoProcesadoResponse,
  type Pagina,
} from '@contabilidad/contracts';
import type {
  OrdenAjusteEntrada,
  ProcesarAjusteOrdenUseCase,
} from '../../../application/commands/ProcesarAjusteOrdenUseCase';
import type { RegistrarAjusteUseCase } from '../../../application/commands/RegistrarAjusteUseCase';
import type { ListarAjustesQuery } from '../../../application/queries/ListarAjustesQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

interface Deps {
  registrarAjuste: RegistrarAjusteUseCase;
  procesarAjusteOrden: ProcesarAjusteOrdenUseCase;
  listarAjustes: ListarAjustesQuery;
}

/**
 * HU-CON-06: POST /ajustes (contador), GET /ajustes y los eventos del módulo de Órdenes
 * POST /eventos/orden-cancelada y POST /eventos/orden-devuelta (rol SISTEMA).
 */
export function ajustesRoutes({
  registrarAjuste,
  procesarAjusteOrden,
  listarAjustes,
}: Deps): Router {
  const router = Router();

  router.post('/ajustes', requireRole('CONTADOR'), async (req, res) => {
    const entrada = parse(req, 'body', registrarAjusteSchema);
    const body: AjusteDto = await registrarAjuste.execute(entrada, contexto(res));
    res.status(201).json(body);
  });

  router.get('/ajustes', requireRole('CONTADOR', 'ADMIN_FINANCIERO'), async (req, res) => {
    const filtro = parse(req, 'query', listarAjustesQuerySchema);
    const body: Pagina<AjusteDto> = await listarAjustes.execute(filtro, contexto(res));
    res.json(body);
  });

  const procesar = async (evento: OrdenAjusteEntrada, res: Response) => {
    const { eventId, resultado, detalle } = await procesarAjusteOrden.execute(
      evento,
      contexto(res),
    );
    const body: EventoProcesadoResponse = { eventId, resultado, ...(detalle ? { detalle } : {}) };
    res.status(resultado === 'PROCESADO' ? 201 : 200).json(body);
  };

  router.post('/eventos/orden-cancelada', requireRole('SISTEMA'), async (req, res) => {
    await procesar(parse(req, 'body', ordenCanceladaSchema), res);
  });

  router.post('/eventos/orden-devuelta', requireRole('SISTEMA'), async (req, res) => {
    await procesar(parse(req, 'body', ordenDevueltaSchema), res);
  });

  return router;
}
