import type { AuthContext } from '../../../application/ports/out/AuthContext';
import type { Actor } from '../../../application/security';

/**
 * Autenticación de desarrollo (AUTH_MODE=mock). Tokens fijos:
 *   Authorization: Bearer mock-admin       (rol ADMIN)
 *   Authorization: Bearer mock-vendedor    (rol VENDEDOR, vendedor V-1)
 *   Authorization: Bearer mock-comprador   (rol COMPRADOR)
 *   Authorization: Bearer mock-sistema     (servicio: módulos Órdenes y Pagos)
 * En producción se usa Supabase Auth; los servicios se autentican con su clave (Fase 2).
 */
export const USUARIOS_MOCK: Record<string, Actor> = {
  'mock-admin': { id: 'u-admin', nombre: 'Administrador de prueba', roles: ['ADMIN'] },
  'mock-vendedor': {
    id: 'u-vendedor',
    nombre: 'Vendedor de prueba',
    roles: ['VENDEDOR'],
    vendedorId: 'V-1',
  },
  'mock-comprador': { id: 'u-comprador', nombre: 'Comprador de prueba', roles: ['COMPRADOR'] },
  'mock-sistema': {
    id: 'servicio:marketplace',
    nombre: 'Módulos del marketplace',
    roles: [],
    servicio: 'marketplace',
  },
};

export class MockAuthContext implements AuthContext {
  async autenticar(token: string): Promise<Actor | null> {
    return USUARIOS_MOCK[token] ?? null;
  }
}
