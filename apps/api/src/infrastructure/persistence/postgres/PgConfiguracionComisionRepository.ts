import type { ConfiguracionComisionRepository } from '../../../application/ports/out/ConfiguracionComisionRepository';
import {
  ComisionNoConfiguradaError,
  ConfiguracionComision,
  seleccionarVigente,
  type AlcanceComision,
} from '../../../domain/comision/ConfiguracionComision';
import { Porcentaje, type FechaContable } from '../../../domain/shared';
import type { Queryable } from './pool';

interface Fila {
  id: string;
  porcentaje: string;
  alcance: AlcanceComision;
  referencia_id: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  creado_por: string;
}

const COLUMNAS = `id, porcentaje, alcance, referencia_id, vigente_desde, vigente_hasta, creado_por`;

function aDominio(f: Fila): ConfiguracionComision {
  return ConfiguracionComision.reconstituir({
    id: f.id,
    porcentaje: Porcentaje.of(f.porcentaje),
    alcance: f.alcance,
    referenciaId: f.referencia_id,
    vigenteDesde: f.vigente_desde,
    vigenteHasta: f.vigente_hasta,
    creadoPor: f.creado_por,
  });
}

/** Implementa también CommissionConfigProvider (lo usa la HU-CON-01 dentro de su UnitOfWork). */
export class PgConfiguracionComisionRepository implements ConfiguracionComisionRepository {
  constructor(private readonly db: Queryable) {}

  async abiertaPara(
    alcance: AlcanceComision,
    referenciaId: string | null,
  ): Promise<ConfiguracionComision | null> {
    const { rows } = await this.db.query<Fila>(
      `SELECT ${COLUMNAS} FROM contabilidad.configuracion_comision
        WHERE alcance = $1 AND referencia_id IS NOT DISTINCT FROM $2 AND vigente_hasta IS NULL
        FOR UPDATE`,
      [alcance, referenciaId],
    );
    return rows[0] ? aDominio(rows[0]) : null;
  }

  async guardar(c: ConfiguracionComision): Promise<void> {
    await this.db.query(
      `INSERT INTO contabilidad.configuracion_comision (${COLUMNAS})
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        c.id,
        c.porcentaje.toString(),
        c.alcance,
        c.referenciaId,
        c.vigenteDesde,
        c.vigenteHasta,
        c.creadoPor,
      ],
    );
  }

  async actualizarCierre(c: ConfiguracionComision): Promise<void> {
    await this.db.query(
      `UPDATE contabilidad.configuracion_comision SET vigente_hasta = $2 WHERE id = $1`,
      [c.id, c.vigenteHasta],
    );
  }

  async vigenteEn(
    alcance: AlcanceComision,
    referenciaId: string | null,
    fecha: FechaContable,
  ): Promise<ConfiguracionComision | null> {
    const { rows } = await this.db.query<Fila>(
      `SELECT ${COLUMNAS} FROM contabilidad.configuracion_comision
        WHERE alcance = $1 AND referencia_id IS NOT DISTINCT FROM $2
          AND vigente_desde <= $3 AND (vigente_hasta IS NULL OR vigente_hasta >= $3)`,
      [alcance, referenciaId, fecha],
    );
    return rows[0] ? aDominio(rows[0]) : null;
  }

  async historial(
    alcance: AlcanceComision,
    referenciaId: string | null,
  ): Promise<ConfiguracionComision[]> {
    const { rows } = await this.db.query<Fila>(
      `SELECT ${COLUMNAS} FROM contabilidad.configuracion_comision
        WHERE alcance = $1 AND referencia_id IS NOT DISTINCT FROM $2
        ORDER BY vigente_desde DESC`,
      [alcance, referenciaId],
    );
    return rows.map(aDominio);
  }

  async obtenerVigente(
    fecha: FechaContable,
    vendedorId: string,
    categoriaId?: string,
  ): Promise<Porcentaje> {
    const { rows } = await this.db.query<Fila>(
      `SELECT ${COLUMNAS} FROM contabilidad.configuracion_comision
        WHERE vigente_desde <= $1 AND (vigente_hasta IS NULL OR vigente_hasta >= $1)
          AND (alcance = 'GLOBAL'
               OR (alcance = 'VENDEDOR' AND referencia_id = $2)
               OR (alcance = 'CATEGORIA' AND referencia_id = $3))`,
      [fecha, vendedorId, categoriaId ?? null],
    );
    const vigente = seleccionarVigente(rows.map(aDominio), fecha, vendedorId, categoriaId);
    if (!vigente) throw new ComisionNoConfiguradaError(fecha);
    return vigente.porcentaje;
  }
}
