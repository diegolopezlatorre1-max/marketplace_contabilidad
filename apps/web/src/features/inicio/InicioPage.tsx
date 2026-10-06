import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@contabilidad/contracts';
import { ApiError } from '../../shared/api/client';
import { useModulo } from '../../shared/auth/ModuloContext';
import { formatearFechaHora } from '../../shared/format/format';

export function InicioPage() {
  const { api, usuario } = useModulo();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    // /health responde 503 con cuerpo cuando la BD falla: se muestra igual.
    retry: false,
  });

  const estado: HealthResponse | undefined =
    health.data ??
    (health.error instanceof ApiError && health.error.status === 503
      ? (health.error.problem as unknown as HealthResponse)
      : undefined);

  return (
    <>
      <section className="ct-card">
        <h2>Bienvenido, {usuario.nombre}</h2>
        <p>
          Módulo de contabilidad del marketplace. Las funcionalidades se habilitan por sprint según
          el plan de desarrollo (docs/Plan_Desarrollo_Modulo_Contabilidad.txt).
        </p>
      </section>

      <section className="ct-card">
        <h2>Estado del módulo</h2>
        {health.isPending && <p>Consultando…</p>}
        {health.isError && !estado && <p className="ct-error">No se pudo contactar la API.</p>}
        {estado && (
          <dl className="ct-dl">
            <dt>Estado</dt>
            <dd className={estado.status === 'ok' ? 'ct-ok' : 'ct-error'}>{estado.status}</dd>
            <dt>Base de datos</dt>
            <dd className={estado.checks.baseDeDatos === 'ok' ? 'ct-ok' : 'ct-error'}>
              {estado.checks.baseDeDatos}
            </dd>
            <dt>Integración</dt>
            <dd>{estado.integrationMode}</dd>
            <dt>Versión</dt>
            <dd>{estado.version}</dd>
            <dt>Consultado</dt>
            <dd>{formatearFechaHora(estado.fecha)}</dd>
          </dl>
        )}
      </section>
    </>
  );
}
