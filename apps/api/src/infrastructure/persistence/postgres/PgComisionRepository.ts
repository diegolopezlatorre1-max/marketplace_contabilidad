import type { ComisionRepository } from '../../../application/ports/out/ComisionRepository';
import type { ComisionVenta } from '../../../domain/comision/ComisionVenta';
import type { Queryable } from './pool';

export class PgComisionRepository implements ComisionRepository {
  constructor(private readonly db: Queryable) {}

  /** El CHECK ck_comision_cuadre garantiza en BD que bruto = comisión + neto. */
  async guardar(ventaId: string, c: ComisionVenta): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.comision
         (id, venta_id, porcentaje_aplicado, valor_bruto, valor_comision, valor_neto, calculada_en)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
      [
        ventaId,
        c.porcentajeAplicado.toString(),
        c.valorBruto.toString(),
        c.comision.toString(),
        c.valorNeto.toString(),
        c.calculadaEn,
      ],
    );
  }
}
