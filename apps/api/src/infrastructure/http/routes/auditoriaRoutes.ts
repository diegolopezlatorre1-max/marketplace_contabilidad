import { Router } from 'express';
import {
  listarAuditoriaQuerySchema,
  type Pagina,
  type RegistroAuditoriaDto,
} from '@contabilidad/contracts';
import type { ConsultarAuditoriaQuery } from '../../../application/queries/ConsultarAuditoriaQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

/** HU-CON-11: GET /auditoria (solo ADMIN_FINANCIERO). */
export function auditoriaRoutes({
  consultarAuditoria,
}: {
  consultarAuditoria: ConsultarAuditoriaQuery;
}): Router {
  const router = Router();

  router.get('/auditoria', requireRole('ADMIN_FINANCIERO'), async (req, res) => {
    const filtro = parse(req, 'query', listarAuditoriaQuerySchema);
    const body: Pagina<RegistroAuditoriaDto> = await consultarAuditoria.execute(
      filtro,
      contexto(res),
    );
    res.json(body);
  });

  return router;
}
