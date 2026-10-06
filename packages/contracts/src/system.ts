import type { Rol } from './common';

export interface HealthResponse {
  status: 'ok' | 'degradado';
  modulo: 'contabilidad';
  version: string;
  integrationMode: 'mock' | 'http' | 'events';
  checks: {
    baseDeDatos: 'ok' | 'error';
  };
  fecha: string;
}

export interface UsuarioActualResponse {
  id: string;
  nombre: string;
  roles: Rol[];
}
