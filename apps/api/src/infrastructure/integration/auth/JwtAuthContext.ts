import type { AuthContext } from '../../../application/ports/out/AuthContext';
import type { Actor } from '../../../application/security';

/**
 * Adaptador para el token emitido por el marketplace (AUTH_MODE=jwt).
 * Se implementa en la Fase 6, cuando se conozca el emisor, las claves (JWKS)
 * y el mapeo de roles del marketplace a CONTADOR / ADMIN_FINANCIERO / SISTEMA.
 */
export class JwtAuthContext implements AuthContext {
  async autenticar(_token: string): Promise<Actor | null> {
    throw new Error(
      'JwtAuthContext pendiente de implementar (Fase 6: integración con el marketplace)',
    );
  }
}
