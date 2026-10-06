import { useCallback, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ContabilidadModule } from '../module';
import { MockLogin } from './MockLogin';

const CLAVE_TOKEN = 'contabilidad.token';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1/contabilidad';

function leerToken(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

/** Host mínimo para desarrollar el módulo sin el marketplace. */
export function StandaloneApp() {
  const [token, setToken] = useState<string | null>(leerToken);

  const login = (nuevo: string) => {
    try {
      sessionStorage.setItem(CLAVE_TOKEN, nuevo);
    } catch {
      /* sin almacenamiento: la sesión dura lo que la pestaña */
    }
    setToken(nuevo);
  };

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(CLAVE_TOKEN);
    } catch {
      /* ignorar */
    }
    setToken(null);
  }, []);

  const getToken = useCallback(() => token, [token]);

  if (!token) return <MockLogin onLogin={login} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/contabilidad" replace />} />
        <Route
          path="/contabilidad/*"
          element={
            <ContabilidadModule
              key={token}
              apiBaseUrl={API_BASE_URL}
              getToken={getToken}
              onLogout={logout}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
