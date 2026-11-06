import { Router } from 'express';
import { reporteIngresosQuerySchema } from '@contabilidad/contracts';
import type { ExportarExcelUseCase } from '../../../application/queries/ExportarExcelUseCase';
import { requireRole } from '../middlewares/auth';
import { parse } from '../middlewares/validate';
import { contexto } from '../requestContext';

/** HU-CON-08: GET /exportaciones/excel?desde=&hasta=&vendedorId= (mismos filtros que el reporte). */
export function exportacionesRoutes({
  exportarExcel,
}: {
  exportarExcel: ExportarExcelUseCase;
}): Router {
  const router = Router();

  router.get(
    '/exportaciones/excel',
    requireRole('CONTADOR', 'ADMIN_FINANCIERO'),
    async (req, res) => {
      const filtro = parse(req, 'query', reporteIngresosQuerySchema);
      const archivo = await exportarExcel.execute(filtro, contexto(res));
      res
        .status(200)
        .type(archivo.contentType)
        .attachment(archivo.nombre)
        .setHeader('cache-control', 'no-store')
        .send(archivo.contenido);
    },
  );

  return router;
}
