import { Router } from 'express';
import {
  listarVentasQuerySchema,
  ordenConfirmadaSchema,
  ventaIdParamSchema,
  type EventoProcesadoResponse,
  type Pagina,
  type PeriodosResponse,
  type VentaDetalleDto,
  type VentaDto,
} from '@contabilidad/contracts';
import type { RegistrarVentaConfirmadaUseCase } from '../../../application/commands/RegistrarVentaConfirmadaUseCase';
import type { ListarPeriodosQuery } from '../../../application/queries/ListarPeriodosQuery';
import type { ListarVentasQuery } from '../../../application/queries/ListarVentasQuery';
import type { ObtenerVentaQuery } from '../../../application/queries/ObtenerVentaQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

interface Deps {
  registrarVenta: RegistrarVentaConfirmadaUseCase;
  listarVentas: ListarVentasQuery;
  obtenerVenta: ObtenerVentaQuery;
  listarPeriodos: ListarPeriodosQuery;
}

/**
 * HU-CON-01: POST /eventos/orden-confirmada (módulo de Órdenes), GET /ventas y GET /periodos.
 * HU-CON-02: GET /ventas/{id} con el desglose de la comisión.
 */
export function ventasRoutes({
  registrarVenta,
  listarVentas,
  obtenerVenta,
  listarPeriodos,
}: Deps): Router {
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

  router.get('/ventas/:id', requireRole('CONTADOR', 'ADMIN_FINANCIERO'), async (req, res) => {
    const { id } = parse(req, 'params', ventaIdParamSchema);
    const body: VentaDetalleDto = await obtenerVenta.execute(id, contexto(res));
    res.json(body);
  });

  router.get('/periodos', requireRole('CONTADOR', 'ADMIN_FINANCIERO'), async (_req, res) => {
    const body: PeriodosResponse = {
      periodos: await listarPeriodos.execute(undefined, contexto(res)),
    };
    res.json(body);
  });

  return router;
}
