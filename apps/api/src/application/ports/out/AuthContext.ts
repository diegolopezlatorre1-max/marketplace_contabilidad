import type { Actor } from '../../security';

/**
 * Resuelve el actor a partir de una credencial (token).
 * Adaptadores: MockAuthContext (desarrollo) y SupabaseAuthContext (Supabase Auth).
 */
export interface AuthContext {
  /** Devuelve el actor o null si la credencial no es válida. */
  autenticar(token: string): Promise<Actor | null>;
}
