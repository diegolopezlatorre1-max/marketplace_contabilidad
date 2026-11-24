import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthContext } from '../../../application/ports/out/AuthContext';
import type { Actor } from '../../../application/security';
import { actorDesdeClaims, type SupabaseClaims } from './SupabaseAuthContext';

/** Algoritmos asimétricos que publica Supabase en su JWKS. HS256 (secreto compartido) no se acepta. */
const ALGORITMOS = ['ES256', 'RS256'];

export interface JwksAuthOptions {
  /** URL del proyecto Supabase, p. ej. https://<ref>.supabase.co */
  supabaseUrl: string;
  /** Audiencia esperada; Supabase emite "authenticated" para usuarios con sesión. */
  audiencia?: string;
  /** Fuente de claves; por defecto el JWKS remoto del proyecto (se inyecta en pruebas). */
  claves?: JWTVerifyGetKey;
}

/** https://<ref>.supabase.co/ → https://<ref>.supabase.co/auth/v1 */
export function emisorSupabase(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
}

/**
 * AUTH_MODE=jwks: valida el access token de Supabase contra las claves públicas del proyecto
 * (`/auth/v1/.well-known/jwks.json`) sin necesitar la publishable key. Verifica firma, expiración,
 * emisor y audiencia; nunca se confía en un JWT solo decodificado. Si llega un `kid` desconocido
 * (rotación de claves), jose vuelve a descargar el JWKS. Token inválido → null → 401.
 */
export class JwksAuthContext implements AuthContext {
  private readonly emisor: string;
  private readonly audiencia: string;
  private readonly claves: JWTVerifyGetKey;

  constructor(opciones: JwksAuthOptions) {
    this.emisor = emisorSupabase(opciones.supabaseUrl);
    this.audiencia = opciones.audiencia ?? 'authenticated';
    this.claves =
      opciones.claves ?? createRemoteJWKSet(new URL(`${this.emisor}/.well-known/jwks.json`));
  }

  async autenticar(token: string): Promise<Actor | null> {
    try {
      const { payload } = await jwtVerify(token, this.claves, {
        issuer: this.emisor,
        audience: this.audiencia,
        algorithms: ALGORITMOS,
      });
      return actorDesdeClaims(payload as SupabaseClaims);
    } catch {
      return null;
    }
  }
}
