import type { AuthContext } from '../../../application/ports/out/AuthContext';
import type { Actor } from '../../../application/security';

/**
 * Autenticación de desarrollo (AUTH_MODE=mock). Tokens fijos:
 *   Authorization: Bearer mock-contador
 *   Authorization: Bearer mock-admin
 *   Authorization: Bearer mock-sistema   (otros módulos: Órdenes, Pagos)
 * En la Fase 6 se reemplaza por JwtAuthContext con el token del marketplace.
 */
export const USUARIOS_MOCK: Record<string, Actor> = {
  'mock-contador': { id: 'u-contador', nombre: 'Contador de prueba', roles: ['CONTADOR'] },
  'mock-admin': {
    id: 'u-admin',
    nombre: 'Administrador financiero de prueba',
    roles: ['ADMIN_FINANCIERO'],
  },
  'mock-sistema': {
    id: 'sistema-marketplace',
    nombre: 'Módulos del marketplace',
    roles: ['SISTEMA'],
  },
};

export class MockAuthContext implements AuthContext {
  async autenticar(token: string): Promise<Actor | null> {
    return USUARIOS_MOCK[token] ?? null;
  }
}
