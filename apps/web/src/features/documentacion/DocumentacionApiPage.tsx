import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useModulo } from '../../shared/auth/ModuloContext';
import '../contabilidad/contabilidad.css';
import { leerOpenApi, type Endpoint, type OpenApiDoc } from './openapi';

/** Documentación de la API generada del contrato real que publica el backend (GET /openapi.json). */
export function DocumentacionApiPage() {
  const { api } = useModulo();
  const contrato = useQuery({
    queryKey: ['openapi'],
    queryFn: () => api.get<OpenApiDoc>('/openapi.json'),
    staleTime: 60_000,
  });
  const doc = useMemo(() => (contrato.data ? leerOpenApi(contrato.data) : null), [contrato.data]);

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <h1>Documentación de la API</h1>
        <p>
          {doc
            ? `${doc.titulo} · versión ${doc.version} · base ${doc.baseUrl}`
            : 'Endpoints REST del módulo de contabilidad.'}
        </p>
        {doc && (
          <>
            <p>{doc.descripcion}</p>
            <div className="cp-doc-acciones">
              <a className="cp-boton" href={`${doc.baseUrl}/docs`} target="_blank" rel="noreferrer">
                Probar en Swagger
              </a>
              <a
                className="cp-boton cp-boton--secundario"
                href={`${doc.baseUrl}/openapi.json`}
                target="_blank"
                rel="noreferrer"
              >
                Descargar openapi.json
              </a>
            </div>
          </>
        )}
      </header>

      {contrato.isPending && <p className="cp-vacio">Cargando la documentación…</p>}
      {contrato.isError && (
        <p role="alert" className="cp-error">
          No se pudo cargar el contrato de la API: {contrato.error.message}
        </p>
      )}

      {doc?.grupos.map((grupo) => (
        <section key={grupo.nombre} className="cp-grupo" aria-labelledby={`grupo-${grupo.nombre}`}>
          <h2 id={`grupo-${grupo.nombre}`} className="cp-subtitulo">
            {grupo.nombre}
          </h2>
          {grupo.descripcion && <p className="cp-nota">{grupo.descripcion}</p>}
          <div style={{ marginTop: 12 }}>
            {grupo.endpoints.map((e) => (
              <EndpointDetalle key={e.id} endpoint={e} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function EndpointDetalle({ endpoint: e }: { endpoint: Endpoint }) {
  return (
    <details className="cp-endpoint">
      <summary>
        <span className={`cp-metodo cp-metodo--${e.metodo.toLowerCase()}`}>{e.metodo}</span>
        <span className="cp-ruta">{e.ruta}</span>
        <span className="cp-resumen">{e.resumen}</span>
        {e.protegido && <span className="cp-candado">Requiere token</span>}
      </summary>
      <div className="cp-endpoint-cuerpo">
        {e.descripcion && <p className="cp-nota">{e.descripcion}</p>}

        {e.parametros.length > 0 && (
          <div>
            <h3>Parámetros</h3>
            <div className="cp-scroll">
              <table className="cp-tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>En</th>
                    <th>Tipo</th>
                    <th>Obligatorio</th>
                    <th>Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {e.parametros.map((p) => (
                    <tr key={`${p.ubicacion}-${p.nombre}`}>
                      <td>
                        <code>{p.nombre}</code>
                      </td>
                      <td>{p.ubicacion}</td>
                      <td>{p.tipo}</td>
                      <td>{p.requerido ? 'Sí' : 'No'}</td>
                      <td>{p.descripcion ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {e.cuerpo && (
          <div>
            <h3>Cuerpo de la petición ({e.cuerpo.tipo})</h3>
            {e.cuerpo.campos.length > 0 && (
              <div className="cp-scroll">
                <table className="cp-tabla">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Tipo</th>
                      <th>Obligatorio</th>
                      <th>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.cuerpo.campos.map((c) => (
                      <tr key={c.nombre}>
                        <td>
                          <code>{c.nombre}</code>
                        </td>
                        <td>{c.tipo}</td>
                        <td>{c.requerido ? 'Sí' : 'No'}</td>
                        <td>{c.descripcion ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h3 style={{ marginTop: 12 }}>Ejemplo</h3>
            <pre className="cp-pre">{JSON.stringify(e.cuerpo.ejemplo, null, 2)}</pre>
          </div>
        )}

        <div>
          <h3>Respuestas</h3>
          <div className="cp-scroll">
            <table className="cp-tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {e.respuestas.map((r) => (
                  <tr key={r.codigo}>
                    <td>
                      <code>{r.codigo}</code>
                    </td>
                    <td>{r.descripcion}</td>
                    <td>{r.tipo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </details>
  );
}
