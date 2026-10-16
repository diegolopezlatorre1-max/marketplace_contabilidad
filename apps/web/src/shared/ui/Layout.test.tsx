import { renderToString } from 'react-dom/server';
import { Route, Routes, StaticRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { UsuarioActualResponse } from '@contabilidad/contracts';
import type { ApiClient } from '../api/client';
import { ModuloProvider } from '../auth/ModuloContext';
import { Layout } from './Layout';

const contador: UsuarioActualResponse = {
  id: 'u-contador',
  nombre: 'Contador',
  roles: ['CONTADOR', 'ADMIN_FINANCIERO'],
};

/** Monta el menú como lo hace el host: el módulo bajo una ruta splat (/contabilidad/*). */
function hrefsDelMenu(url: string, montaje = '/contabilidad'): string[] {
  const html = renderToString(
    <StaticRouter location={url}>
      <Routes>
        <Route
          path={`${montaje}/*`}
          element={
            <ModuloProvider value={{ api: {} as ApiClient, usuario: contador, basePath: montaje }}>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={null} />
                  <Route path="*" element={null} />
                </Route>
              </Routes>
            </ModuloProvider>
          }
        />
      </Routes>
    </StaticRouter>,
  );
  return [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]!);
}

const MENU = [
  '/contabilidad',
  '/contabilidad/ventas',
  '/contabilidad/configuracion/comision',
  '/contabilidad/cuentas-por-pagar',
  '/contabilidad/conciliaciones',
  '/contabilidad/documentacion-api',
];

describe('Menú del módulo', () => {
  it.each([
    '/contabilidad',
    '/contabilidad/ventas',
    '/contabilidad/configuracion/comision',
    '/contabilidad/documentacion-api',
  ])('desde %s los enlaces no se acumulan', (url) => {
    expect(hrefsDelMenu(url)).toEqual(MENU);
  });

  it('funciona bajo cualquier ruta de montaje del marketplace', () => {
    expect(hrefsDelMenu('/admin/contabilidad/ventas', '/admin/contabilidad')).toEqual(
      MENU.map((r) => r.replace('/contabilidad', '/admin/contabilidad')),
    );
  });
});
