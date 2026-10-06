import { createContext, useContext, type ReactNode } from 'react';
import type { Rol, UsuarioActualResponse } from '@contabilidad/contracts';
import type { ApiClient } from '../api/client';

export interface ModuloContextValue {
  api: ApiClient;
  usuario: UsuarioActualResponse;
  onLogout?: () => void;
}

const ModuloContext = createContext<ModuloContextValue | null>(null);

export function ModuloProvider({
  value,
  children,
}: {
  value: ModuloContextValue;
  children: ReactNode;
}) {
  return <ModuloContext.Provider value={value}>{children}</ModuloContext.Provider>;
}

export function useModulo(): ModuloContextValue {
  const ctx = useContext(ModuloContext);
  if (!ctx) throw new Error('useModulo debe usarse dentro de <ContabilidadModule>');
  return ctx;
}

export function useTieneRol(...roles: Rol[]): boolean {
  const { usuario } = useModulo();
  return usuario.roles.some((r) => roles.includes(r));
}
