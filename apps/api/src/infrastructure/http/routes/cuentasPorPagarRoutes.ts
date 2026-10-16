import { Router } from 'express';
import { listarCuentasPorPagarQuerySchema, type CuentaPorPagarDto } from '@contabilidad/contracts';
import type { ListarCuentasPorPagarQuery } from '../../../application/queries/ListarCuentasPorPagarQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

interface Deps {
  listarCuentasPorPagar: ListarCuentasPorPagarQuery;
}

/** HU-CON-03: GET /cuentas-por-pagar?periodo=&estado=&vendedorId= */
export function cuentasPorPagarRoutes({ listarCuentasPorPagar }: Deps): Router {
  const router = Router();

  router.get(
    '/cuentas-por-pagar',
    requireRole('CONTADOR', 'ADMIN_FINANCIERO'),
    async (req, res) => {
      const filtro = parse(req, 'query', listarCuentasPorPagarQuerySchema);
      const body: CuentaPorPagarDto[] = await listarCuentasPorPagar.execute(filtro, contexto(res));
      res.json(body);
    },
  );

  return router;
}
