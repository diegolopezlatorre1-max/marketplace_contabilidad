import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { UsuarioActualResponse } from '@contabilidad/contracts';
import { ConfiguracionComisionPanel } from './features/contabilidad/ConfiguracionComisionPanel';
import { ContabilidadPanel } from './features/contabilidad/ContabilidadPanel';
import { crearContabilidadApiRest } from './features/contabilidad/data/contabilidadApiRest';
import { DetalleVentaPage } from './features/contabilidad/DetalleVentaPage';
import { DocumentacionApiPage } from './features/documentacion/DocumentacionApiPage';
import { InicioPage } from './features/inicio/InicioPage';
import { ApiError, createApiClient, type ApiClient } from './shared/api/client';
import { ModuloProvider } from './shared/auth/ModuloContext';
import { RequireRole } from './shared/auth/RequireRole';
import { Layout } from './shared/ui/Layout';
import { basePathDesde, rutaDelModulo } from './shared/ui/rutas';
import './shared/ui/styles.css';

export interface ContabilidadModuleProps {
  /** URL base de la API, p. ej. "/api/v1/contabilidad". */
  apiBaseUrl: string;
  /** Token del usuario autenticado; lo provee el host (marketplace o modo standalone). */
  getToken: () => string | null;
  /** Se invoca si la sesión no es válida o el usuario pulsa "Salir". */
  onLogout?: () => void;
  /** Permite compartir el QueryClient del marketplace. */
  queryClient?: QueryClient;
}

/**
 * Punto de montaje del módulo. El shell del marketplace lo monta así:
 *   <Route path="/contabilidad/*" element={<ContabilidadModule apiBaseUrl=... getToken=... />} />
 * Las rutas internas son relativas, por lo que funciona bajo cualquier basePath.
 */
export function ContabilidadModule({
  apiBaseUrl,
  getToken,
  onLogout,
  queryClient,
}: ContabilidadModuleProps) {
  const client = useMemo(() => queryClient ?? new QueryClient(), [queryClient]);
  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl, getToken }),
    [apiBaseUrl, getToken],
  );

  return (
    <QueryClientProvider client={client}>
      <ModuloConUsuario api={api} {...(onLogout ? { onLogout } : {})} />
    </QueryClientProvider>
  );
}

function ModuloConUsuario({ api, onLogout }: { api: ApiClient; onLogout?: () => void }) {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<UsuarioActualResponse>('/me'),
    retry: false,
  });
  // Las pantallas de contabilidad hablan con la API REST del módulo.
  const contabilidad = useMemo(() => crearContabilidadApiRest(api), [api]);
  // Ruta de montaje (p. ej. /contabilidad): los enlaces del menú se arman desde ella.
  const basePath = basePathDesde(useLocation().pathname, useParams()['*'] ?? '');
  const rutaVenta = (id: string) => rutaDelModulo(basePath, `ventas/${encodeURIComponent(id)}`);

  if (me.isPending) return <p className="ct-content">Cargando…</p>;
  if (me.isError) {
    const noAutenticado = me.error instanceof ApiError && me.error.status === 401;
    return (
      <section className="ct-card ct-content">
        <h2>{noAutenticado ? 'Sesión no válida' : 'No se pudo cargar el módulo'}</h2>
        <p>{me.error.message}</p>
        {onLogout && (
          <button type="button" onClick={onLogout}>
            Volver a ingresar
          </button>
        )}
      </section>
    );
  }

  return (
    <ModuloProvider value={{ api, usuario: me.data, basePath, ...(onLogout ? { onLogout } : {}) }}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <RequireRole roles={['CONTADOR', 'ADMIN_FINANCIERO']}>
                <InicioPage />
              </RequireRole>
            }
          />
          <Route
            path="ventas"
            element={
              <RequireRole roles={['CONTADOR']}>
                <ContabilidadPanel
                  key="ventas"
                  api={contabilidad}
                  vistaInicial="comisiones"
                  rutaVenta={rutaVenta}
                />
              </RequireRole>
            }
          />
          <Route
            path="ventas/:id"
            element={
              <RequireRole roles={['CONTADOR']}>
                <DetalleVentaPage
                  api={contabilidad}
                  rutaVolver={rutaDelModulo(basePath, 'ventas')}
                />
              </RequireRole>
            }
          />
          <Route
            path="cuentas-por-pagar"
            element={
              <RequireRole roles={['CONTADOR']}>
                <ContabilidadPanel
                  key="cuentas"
                  api={contabilidad}
                  vistaInicial="cuentas"
                  rutaVenta={rutaVenta}
                />
              </RequireRole>
            }
          />
          <Route
            path="configuracion/comision"
            element={
              <RequireRole roles={['CONTADOR', 'ADMIN_FINANCIERO']}>
                <ConfiguracionComisionPanel api={contabilidad} />
              </RequireRole>
            }
          />
          <Route
            path="documentacion-api"
            element={
              <RequireRole roles={['CONTADOR', 'ADMIN_FINANCIERO']}>
                <DocumentacionApiPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<p>Página no encontrada.</p>} />
        </Route>
      </Routes>
    </ModuloProvider>
  );
}
