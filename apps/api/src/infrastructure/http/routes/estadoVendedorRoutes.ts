import { Router } from 'express';
import {
  estadoVendedorQuerySchema,
  vendedorIdParamSchema,
  type EstadoVendedorDto,
} from '@contabilidad/contracts';
import type { EstadoVendedorQuery } from '../../../application/queries/EstadoVendedorQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

/** HU-CON-07: GET /vendedores/{id}/estado?desde=&hasta=. ADMIN o el propio VENDEDOR. */
export function estadoVendedorRoutes({
  estadoVendedor,
}: {
  estadoVendedor: EstadoVendedorQuery;
}): Router {
  const router = Router();

  router.get('/vendedores/:id/estado', requireRole('ADMIN', 'VENDEDOR'), async (req, res) => {
    const { id } = parse(req, 'params', vendedorIdParamSchema);
    const filtro = parse(req, 'query', estadoVendedorQuerySchema);
    const body: EstadoVendedorDto = await estadoVendedor.execute(
      { vendedorId: id, ...filtro },
      contexto(res),
    );
    res.json(body);
  });

  return router;
}
