import { Router } from 'express';
import { reporteIngresosQuerySchema, type ReporteIngresosDto } from '@contabilidad/contracts';
import type { ReporteIngresosQuery } from '../../../application/queries/ReporteIngresosQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

/** HU-CON-05: GET /reportes/ingresos?desde=&hasta=&vendedorId= */
export function reportesRoutes({ reporteIngresos }: { reporteIngresos: ReporteIngresosQuery }) {
  const router = Router();

  router.get(
    '/reportes/ingresos',
    requireRole('CONTADOR', 'ADMIN_FINANCIERO'),
    async (req, res) => {
      const filtro = parse(req, 'query', reporteIngresosQuerySchema);
      const body: ReporteIngresosDto = await reporteIngresos.execute(filtro, contexto(res));
      res.json(body);
    },
  );

  return router;
}
