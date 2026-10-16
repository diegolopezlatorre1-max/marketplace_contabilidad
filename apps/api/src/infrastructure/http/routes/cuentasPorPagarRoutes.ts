import { Router } from 'express';
import {
  listarCuentasPorPagarQuerySchema,
  resumenCuentasPorPagarQuerySchema,
  type CuentaPorPagarDto,
  type ResumenSaldoVendedorDto,
} from '@contabilidad/contracts';
import type { ListarCuentasPorPagarQuery } from '../../../application/queries/ListarCuentasPorPagarQuery';
import type { ResumenSaldoVendedorQuery } from '../../../application/queries/ResumenSaldoVendedorQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

interface Deps {
  listarCuentasPorPagar: ListarCuentasPorPagarQuery;
  resumenSaldoVendedor: ResumenSaldoVendedorQuery;
}

/** HU-CON-03: GET /cuentas-por-pagar?periodo=&estado=&vendedorId= y GET /cuentas-por-pagar/resumen?periodo= */
export function cuentasPorPagarRoutes({
  listarCuentasPorPagar,
  resumenSaldoVendedor,
}: Deps): Router {
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

  router.get(
    '/cuentas-por-pagar/resumen',
    requireRole('CONTADOR', 'ADMIN_FINANCIERO'),
    async (req, res) => {
      const filtro = parse(req, 'query', resumenCuentasPorPagarQuerySchema);
      const body: ResumenSaldoVendedorDto[] = await resumenSaldoVendedor.execute(
        filtro,
        contexto(res),
      );
      res.json(body);
    },
  );

  return router;
}
