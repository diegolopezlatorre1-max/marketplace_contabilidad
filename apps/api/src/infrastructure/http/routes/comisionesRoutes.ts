import { Router } from 'express';
import {
  configurarComisionSchema,
  obtenerComisionQuerySchema,
  type ConfiguracionComisionResponse,
} from '@contabilidad/contracts';
import type { ConfigurarComisionUseCase } from '../../../application/commands/ConfigurarComisionUseCase';
import type {
  EstadoComision,
  ObtenerComisionVigenteQuery,
} from '../../../application/queries/ObtenerComisionVigenteQuery';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

interface Deps {
  configurarComision: ConfigurarComisionUseCase;
  obtenerComision: ObtenerComisionVigenteQuery;
}

function aRespuesta(estado: EstadoComision): ConfiguracionComisionResponse {
  return {
    fecha: estado.fecha,
    vigente: estado.vigente?.toJSON() ?? null,
    historial: estado.historial.map((c) => c.toJSON()),
  };
}

/** HU-CON-09: GET/PUT /comisiones/configuracion. */
export function comisionesRoutes({ configurarComision, obtenerComision }: Deps): Router {
  const router = Router();

  router.get(
    '/comisiones/configuracion',
    requireRole('CONTADOR', 'ADMIN_FINANCIERO'),
    async (req, res) => {
      const query = parse(req, 'query', obtenerComisionQuerySchema);
      res.json(aRespuesta(await obtenerComision.execute(query, contexto(res))));
    },
  );

  router.put('/comisiones/configuracion', requireRole('ADMIN_FINANCIERO'), async (req, res) => {
    const body = parse(req, 'body', configurarComisionSchema);
    res.json(aRespuesta(await configurarComision.execute(body, contexto(res))));
  });

  return router;
}
