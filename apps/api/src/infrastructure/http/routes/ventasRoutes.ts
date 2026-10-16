import { Router } from 'express';
import {
  listarVentasQuerySchema,
  ordenConfirmadaSchema,
  type EventoProcesadoResponse,
  type Pagina,
  type VentaDto,
} from '@contabilidad/contracts';
import type { RegistrarVentaConfirmadaUseCase } from '../../../application/commands/RegistrarVentaConfirmadaUseCase';
import type { ListarVentasQuery } from '../../../application/queries/ListarVentasQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

interface Deps {
  registrarVenta: RegistrarVentaConfirmadaUseCase;
  listarVentas: ListarVentasQuery;
}

/** HU-CON-01: POST /eventos/orden-confirmada (módulo de Órdenes) y GET /ventas. */
export function ventasRoutes({ registrarVenta, listarVentas }: Deps): Router {
  const router = Router();

  router.post('/eventos/orden-confirmada', requireRole('SISTEMA'), async (req, res) => {
    const evento = parse(req, 'body', ordenConfirmadaSchema);
    const { eventId, resultado, detalle } = await registrarVenta.execute(evento, contexto(res));
    const body: EventoProcesadoResponse = { eventId, resultado, ...(detalle ? { detalle } : {}) };
    res.status(resultado === 'PROCESADO' ? 201 : 200).json(body);
  });

  router.get('/ventas', requireRole('CONTADOR', 'ADMIN_FINANCIERO'), async (req, res) => {
    const query = parse(req, 'query', listarVentasQuerySchema);
    const body: Pagina<VentaDto> = await listarVentas.execute(query, contexto(res));
    res.json(body);
  });

  return router;
}
