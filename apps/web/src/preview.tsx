import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Rol, UsuarioActualResponse } from '@contabilidad/contracts';
import { ContabilidadPanel } from './features/contabilidad/ContabilidadPanel';
import { InicioPage } from './features/inicio/InicioPage';
import type { ApiClient } from './shared/api/client';
import { ModuloProvider } from './shared/auth/ModuloContext';
import { RequireRole } from './shared/auth/RequireRole';
import { Layout } from './shared/ui/Layout';
import './shared/ui/styles.css';
import './preview.css';

// Usuario y API simulados: solo para ver el diseño sin backend.
const usuario = {
  nombre: 'Diego (vista previa)',
  roles: ['CONTADOR'],
} as UsuarioActualResponse;

const api = {
  get: async () => {
    throw new Error('Sin API en la vista previa');
  },
} as unknown as ApiClient;

const queryClient = new QueryClient();

function VistaPrevia() {
  const [rol, setRol] = useState<Rol>('CONTADOR');

  return (
    <QueryClientProvider client={queryClient}>
      <ModuloProvider value={{ api, usuario: { ...usuario, roles: [rol] } }}>
        <MemoryRouter key={rol} initialEntries={[rol === 'CONTADOR' ? '/ventas' : '/']}>
          <>
            <label className="ct-preview-role">
              Vista previa del rol
              <select
                value={rol}
                onChange={(event) =>
                  setRol(
                    event.target.value === 'ADMIN_FINANCIERO' ? 'ADMIN_FINANCIERO' : 'CONTADOR',
                  )
                }
              >
                <option value="CONTADOR">Contador</option>
                <option value="ADMIN_FINANCIERO">Administrador financiero</option>
              </select>
            </label>
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
                      <ContabilidadPanel key="ventas" vistaInicial="comisiones" />
                    </RequireRole>
                  }
                />
                <Route
                  path="cuentas-por-pagar"
                  element={
                    <RequireRole roles={['CONTADOR']}>
                      <ContabilidadPanel key="cuentas" vistaInicial="cuentas" />
                    </RequireRole>
                  }
                />
                <Route path="*" element={<p>Página no encontrada.</p>} />
              </Route>
            </Routes>
          </>
        </MemoryRouter>
      </ModuloProvider>
    </QueryClientProvider>
  );
}

const raiz = document.getElementById('preview-root');
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <VistaPrevia />
    </StrictMode>,
  );
}