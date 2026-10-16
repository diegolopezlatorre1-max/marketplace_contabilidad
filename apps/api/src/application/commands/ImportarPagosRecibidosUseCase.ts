import { randomUUID } from 'node:crypto';
import { PoliticaConciliacion } from '../../domain/conciliacion/Conciliacion';
import { DomainError } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { UnitOfWork } from '../ports/out/UnitOfWork';
import { exigirRol } from '../security';
import {
  estadoDelPago,
  registrarPago,
  type DependenciasConciliacion,
} from './conciliacion/operaciones';

/** Fila de un archivo de pagos ya leída; si no se pudo leer, trae el error. */
export type FilaPagoImportado =
  | { linea: number; referencia: string; fecha: Date; valor: string; ordenes: string[] }
  | { linea: number; referencia?: string | undefined; error: string };

export interface ResultadoFilaImportada {
  linea: number;
  referencia?: string;
  resultado: 'IMPORTADO' | 'DUPLICADO' | 'ERROR';
  estado?: 'SIN_CONCILIAR' | 'CONCILIADO' | 'PENDIENTE';
  detalle?: string;
}

export interface ResultadoImportacion {
  filas: ResultadoFilaImportada[];
  importados: number;
  duplicados: number;
  errores: number;
}

/**
 * HU-CON-04: importa pagos recibidos desde un archivo CSV de la pasarela. Cada fila
 * se registra en su propia transacción: una fila con error no impide las demás.
 */
export class ImportarPagosRecibidosUseCase implements UseCase<
  { filas: FilaPagoImportado[] },
  ResultadoImportacion
> {
  private readonly deps: DependenciasConciliacion;

  constructor(
    private readonly uow: UnitOfWork,
    clock: Clock,
    politica: PoliticaConciliacion = new PoliticaConciliacion(),
    generarId: () => string = randomUUID,
  ) {
    this.deps = { clock, politica, generarId };
  }

  async execute(
    { filas }: { filas: FilaPagoImportado[] },
    ctx: ContextoEjecucion,
  ): Promise<ResultadoImportacion> {
    exigirRol(ctx.actor, ['CONTADOR']);
    const resultados: ResultadoFilaImportada[] = [];
    for (const fila of filas) {
      const referencia = fila.referencia ? { referencia: fila.referencia } : {};
      if ('error' in fila) {
        resultados.push({
          linea: fila.linea,
          ...referencia,
          resultado: 'ERROR',
          detalle: fila.error,
        });
        continue;
      }
      try {
        const registrado = await this.uow.run((repos) =>
          registrarPago(
            repos,
            {
              referenciaPasarela: fila.referencia,
              fecha: fila.fecha,
              valor: fila.valor,
              origen: 'CSV',
              ordenes: fila.ordenes,
            },
            this.deps,
            ctx,
          ),
        );
        resultados.push({
          linea: fila.linea,
          ...referencia,
          resultado: 'IMPORTADO',
          estado: estadoDelPago(registrado),
          ...(registrado.motivoSinConciliar ? { detalle: registrado.motivoSinConciliar } : {}),
        });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        resultados.push({
          linea: fila.linea,
          ...referencia,
          resultado: error.code === 'REFERENCIA_DUPLICADA' ? 'DUPLICADO' : 'ERROR',
          detalle: error.message,
        });
      }
    }
    const contar = (r: ResultadoFilaImportada['resultado']) =>
      resultados.filter((x) => x.resultado === r).length;
    return {
      filas: resultados,
      importados: contar('IMPORTADO'),
      duplicados: contar('DUPLICADO'),
      errores: contar('ERROR'),
    };
  }
}
