import type {
  AlcanceComision,
  ConfiguracionComision,
} from '../../../domain/comision/ConfiguracionComision';
import type { FechaContable } from '../../../domain/shared';
import type { CommissionConfigProvider } from './CommissionConfigProvider';

export interface ConfiguracionComisionRepository extends CommissionConfigProvider {
  /** Vigencia abierta del alcance/referencia, bloqueada hasta el fin de la transacción. */
  abiertaPara(
    alcance: AlcanceComision,
    referenciaId: string | null,
  ): Promise<ConfiguracionComision | null>;
  guardar(config: ConfiguracionComision): Promise<void>;
  /** Persiste el cierre (vigenteHasta) de una vigencia existente. */
  actualizarCierre(config: ConfiguracionComision): Promise<void>;
  /** Configuración del alcance/referencia que cubre la fecha (null si no hay). */
  vigenteEn(
    alcance: AlcanceComision,
    referenciaId: string | null,
    fecha: FechaContable,
  ): Promise<ConfiguracionComision | null>;
  /** Todas las vigencias del alcance/referencia, de la más reciente a la más antigua. */
  historial(
    alcance: AlcanceComision,
    referenciaId: string | null,
  ): Promise<ConfiguracionComision[]>;
}
