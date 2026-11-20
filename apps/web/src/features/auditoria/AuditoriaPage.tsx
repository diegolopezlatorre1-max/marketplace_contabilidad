import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ENTIDADES_AUDITADAS,
  type Pagina,
  type RegistroAuditoriaDto,
} from '@contabilidad/contracts';
import { useModulo } from '../../shared/auth/ModuloContext';
import '../contabilidad/contabilidad.css';
import { diferencias } from './diferencias';

const TAMANO = 25;

const NOMBRES: Record<string, string> = {
  configuracion_comision: 'Configuración de comisión',
  venta_contable: 'Venta',
  pago_recibido: 'Pago recibido',
  conciliacion: 'Conciliación',
  ajuste_contable: 'Ajuste',
  pago_vendedor: 'Pago a vendedor',
};

/** Hoy en hora de Colombia (AAAA-MM-DD). */
function hoyContable(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

const formatoFecha = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * HU-CON-11: quién hizo cada cambio contable, cuándo y con qué valores antes y después.
 * Solo para el administrador financiero.
 */
export function AuditoriaPage() {
  const { api } = useModulo();
  const hoy = hoyContable();
  const [entidad, setEntidad] = useState('');
  const [usuario, setUsuario] = useState('');
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [page, setPage] = useState(1);
  const [abierto, setAbierto] = useState<number | null>(null);

  const q = new URLSearchParams({ page: String(page), size: String(TAMANO) });
  if (entidad) q.set('entidad', entidad);
  if (usuario.trim()) q.set('usuario', usuario.trim());
  if (desde) q.set('desde', desde);
  if (hasta) q.set('hasta', hasta);
  const consulta = useQuery({
    queryKey: ['auditoria', q.toString()],
    queryFn: () => api.get<Pagina<RegistroAuditoriaDto>>(`/auditoria?${q.toString()}`),
  });

  const filtrar = (cambiar: () => void) => {
    cambiar();
    setPage(1);
    setAbierto(null);
  };
  const datos = consulta.data;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / TAMANO)) : 1;

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <h1>Auditoría de movimientos</h1>
        <p>
          Cada cambio contable queda registrado con su usuario, la fecha y los valores antes y
          después.
        </p>
      </header>

      <div className="cp-barra">
        <label className="cp-filtro">
          Entidad
          <select value={entidad} onChange={(e) => filtrar(() => setEntidad(e.target.value))}>
            <option value="">Todas</option>
            {ENTIDADES_AUDITADAS.map((e) => (
              <option key={e} value={e}>
                {NOMBRES[e] ?? e}
              </option>
            ))}
          </select>
        </label>
        <label className="cp-filtro">
          Usuario
          <input
            placeholder="u-contador"
            value={usuario}
            onChange={(e) => filtrar(() => setUsuario(e.target.value))}
          />
        </label>
        <label className="cp-filtro">
          Desde
          <input
            type="date"
            max={hasta}
            value={desde}
            onChange={(e) => filtrar(() => setDesde(e.target.value))}
          />
        </label>
        <label className="cp-filtro">
          Hasta
          <input
            type="date"
            min={desde}
            value={hasta}
            onChange={(e) => filtrar(() => setHasta(e.target.value))}
          />
        </label>
      </div>

      {consulta.isError && (
        <p role="alert" className="cp-error">
          {consulta.error.message}
        </p>
      )}
      {consulta.isPending && <p className="cp-vacio">Cargando…</p>}
      {datos &&
        (datos.items.length === 0 ? (
          <p className="cp-vacio">No hay movimientos con esos filtros.</p>
        ) : (
          <>
            <div className="cp-scroll">
              <table className="cp-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Entidad</th>
                    <th>Acción</th>
                    <th>Usuario</th>
                    <th className="cp-envolver">Identificador</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {datos.items.map((r) => (
                    <FilaAuditoria
                      key={r.id}
                      registro={r}
                      abierto={abierto === r.id}
                      onAlternar={() => setAbierto(abierto === r.id ? null : r.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cp-barra">
              <span>
                {datos.total} movimientos · página {page} de {paginas}
              </span>
              <button
                type="button"
                className="cp-boton cp-boton--secundario"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <button
                type="button"
                className="cp-boton cp-boton--secundario"
                disabled={page >= paginas}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </>
        ))}
    </section>
  );
}

function FilaAuditoria({
  registro: r,
  abierto,
  onAlternar,
}: {
  registro: RegistroAuditoriaDto;
  abierto: boolean;
  onAlternar: () => void;
}) {
  const filas = abierto ? diferencias(r.valoresAnteriores, r.valoresNuevos) : [];
  return (
    <>
      <tr className={abierto ? 'cp-fila-activa' : undefined}>
        <td>{formatoFecha.format(new Date(r.fecha))}</td>
        <td>{NOMBRES[r.entidad] ?? r.entidad}</td>
        <td>{r.accion}</td>
        <td>{r.usuario}</td>
        <td className="cp-envolver">{r.entidadId}</td>
        <td>
          <button type="button" className="cp-enlace" aria-expanded={abierto} onClick={onAlternar}>
            {abierto ? 'Ocultar cambios' : 'Ver cambios'}
          </button>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={6}>
            {filas.length === 0 ? (
              <p className="cp-vacio">El registro no guarda valores.</p>
            ) : (
              <table className="cp-tabla">
                <thead>
                  <tr>
                    <th className="cp-envolver">Campo</th>
                    <th className="cp-envolver">Antes</th>
                    <th className="cp-envolver">Después</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.campo} className={f.cambio ? 'cp-fila-activa' : undefined}>
                      <td className="cp-envolver">{f.campo}</td>
                      <td className="cp-envolver">{f.antes ?? '—'}</td>
                      <td className="cp-envolver">{f.despues ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.correlationId && <p className="cp-vacio">Correlation id: {r.correlationId}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
