import { Router } from 'express';
import {
  listarPagosVendedorQuerySchema,
  registrarPagoVendedorSchema,
  type Pagina,
  type PagoVendedorDto,
} from '@contabilidad/contracts';
import type { RegistrarPagoVendedorUseCase } from '../../../application/commands/RegistrarPagoVendedorUseCase';
import type { ListarPagosVendedorQuery } from '../../../application/queries/ListarPagosVendedorQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

interface Deps {
  registrarPagoVendedor: RegistrarPagoVendedorUseCase;
  listarPagosVendedor: ListarPagosVendedorQuery;
}

/** HU-CON-10: POST /pagos-vendedor (contador) y GET /pagos-vendedor. */
export function pagosVendedorRoutes({ registrarPagoVendedor, listarPagosVendedor }: Deps): Router {
  const router = Router();

  router.post('/pagos-vendedor', requireRole('CONTADOR'), async (req, res) => {
    const entrada = parse(req, 'body', registrarPagoVendedorSchema);
    const body: PagoVendedorDto = await registrarPagoVendedor.execute(entrada, contexto(res));
    res.status(201).json(body);
  });

  router.get('/pagos-vendedor', requireRole('CONTADOR', 'ADMIN_FINANCIERO'), async (req, res) => {
    const filtro = parse(req, 'query', listarPagosVendedorQuerySchema);
    const body: Pagina<PagoVendedorDto> = await listarPagosVendedor.execute(filtro, contexto(res));
    res.json(body);
  });

  return router;
}
