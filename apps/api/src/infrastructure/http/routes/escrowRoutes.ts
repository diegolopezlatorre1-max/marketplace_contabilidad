import { Router } from 'express';
import {
  bloquearEscrowSchema,
  desbloquearEscrowSchema,
  marcarEntregaSchema,
  pedidoIdParamSchema,
  type EscrowPedidoDto,
  type ResultadoEscrowDto,
} from '@contabilidad/contracts';
import type { ActualizarEscrowUseCase } from '../../../application/commands/ActualizarEscrowUseCase';
import type { ObtenerEscrowQuery } from '../../../application/queries/ObtenerEscrowQuery';
import { requireRole, requireServicio } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

interface Deps {
  actualizarEscrow: ActualizarEscrowUseCase;
  obtenerEscrow: ObtenerEscrowQuery;
}

/**
 * Escrow (GUIA_EQUIPO_6, sección 6):
 *   POST /escrow/marcar-entrega/{pedidoId}  (servicio: Órdenes) → retención de 72 h, se libera sola
 *   POST /escrow/bloquear/{pedidoId}        (servicio, módulo por definir) → PQR abierta
 *   POST /escrow/desbloquear/{pedidoId}     (ADMIN, motivo obligatorio) → desbloqueo manual
 *   GET  /escrow/{pedidoId}                 (ADMIN)
 */
export function escrowRoutes({ actualizarEscrow, obtenerEscrow }: Deps): Router {
  const router = Router();

  router.post('/escrow/marcar-entrega/:pedidoId', requireServicio(), async (req, res) => {
    const { pedidoId } = parse(req, 'params', pedidoIdParamSchema);
    const { fechaEntrega } = parse(req, 'body', marcarEntregaSchema);
    const body: ResultadoEscrowDto = await actualizarEscrow.execute(
      { pedidoId, accion: 'MARCAR_ENTREGA', fechaEntrega },
      contexto(res),
    );
    res.json(body);
  });

  router.post('/escrow/bloquear/:pedidoId', requireServicio(), async (req, res) => {
    const { pedidoId } = parse(req, 'params', pedidoIdParamSchema);
    const { motivo } = parse(req, 'body', bloquearEscrowSchema);
    const body: ResultadoEscrowDto = await actualizarEscrow.execute(
      { pedidoId, accion: 'BLOQUEAR', motivo },
      contexto(res),
    );
    res.json(body);
  });

  router.post('/escrow/desbloquear/:pedidoId', requireRole('ADMIN'), async (req, res) => {
    const { pedidoId } = parse(req, 'params', pedidoIdParamSchema);
    const { motivo } = parse(req, 'body', desbloquearEscrowSchema);
    const body: ResultadoEscrowDto = await actualizarEscrow.execute(
      { pedidoId, accion: 'DESBLOQUEAR', motivo },
      contexto(res),
    );
    res.json(body);
  });

  router.get('/escrow/:pedidoId', requireRole('ADMIN'), async (req, res) => {
    const { pedidoId } = parse(req, 'params', pedidoIdParamSchema);
    const body: EscrowPedidoDto = await obtenerEscrow.execute({ pedidoId }, contexto(res));
    res.json(body);
  });

  return router;
}
