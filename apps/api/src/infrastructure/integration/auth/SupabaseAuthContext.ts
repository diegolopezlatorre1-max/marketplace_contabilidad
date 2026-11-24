import { createClient } from '@supabase/supabase-js';
import type { AuthContext } from '../../../application/ports/out/AuthContext';
import { ROLES, type Actor, type Rol } from '../../../application/security';

/** Claims del access token de Supabase que usa el módulo. */
export interface SupabaseClaims {
  sub?: unknown;
  email?: unknown;
  app_metadata?: Record<string, unknown> | undefined;
  user_metadata?: Record<string, unknown> | undefined;
  [key: string]: unknown;
}

/** Lo único que el adaptador necesita del cliente de Supabase (permite simularlo en pruebas). */
export interface SupabaseAuthClient {
  auth: {
    getClaims(jwt: string): Promise<{
      data: { claims: SupabaseClaims } | null;
      error: unknown;
    }>;
  };
}

export interface SupabaseAuthOptions {
  url: string;
  publishableKey: string;
}

/** Crea el cliente real de Supabase para validar tokens en el servidor (sin sesión persistente). */
export function crearClienteSupabase({
  url,
  publishableKey,
}: SupabaseAuthOptions): SupabaseAuthClient {
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as unknown as SupabaseAuthClient;
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
}

/** "admin", "Admin" o "ADMIN" → ADMIN. Un valor desconocido se ignora (el usuario queda sin rol → 403). */
function aRol(valor: unknown): Rol | undefined {
  const normalizado = texto(valor)?.toUpperCase();
  return ROLES.find((r) => r === normalizado);
}

/** Lee el rol de app_metadata.role (texto) o app_metadata.roles (lista). */
function rolesDe(appMetadata: Record<string, unknown> | undefined): Rol[] {
  if (!appMetadata) return [];
  const crudos = Array.isArray(appMetadata.roles) ? appMetadata.roles : [appMetadata.role];
  return [...new Set(crudos.map(aRol).filter((r): r is Rol => r !== undefined))];
}

/** Convierte los claims verificados en el actor del módulo. Exportado para pruebas. */
export function actorDesdeClaims(claims: SupabaseClaims): Actor | null {
  const id = texto(claims.sub);
  if (!id) return null;
  const roles = rolesDe(claims.app_metadata);
  const nombre =
    texto(claims.user_metadata?.full_name) ??
    texto(claims.user_metadata?.name) ??
    texto(claims.email) ??
    id;
  // GUIA_EQUIPO_6: el UUID autenticado identifica al usuario. Si el marketplace asigna un id de
  // vendedor distinto, debe venir en app_metadata.vendedor_id (pendiente de confirmar).
  const vendedorId = roles.includes('VENDEDOR')
    ? (texto(claims.app_metadata?.vendedor_id) ?? id)
    : undefined;
  return { id, nombre, roles, ...(vendedorId ? { vendedorId } : {}) };
}

/**
 * AUTH_MODE=supabase: valida el access token con Supabase Auth (getClaims verifica la firma y la
 * expiración; nunca se confía en un JWT solo decodificado). Token inválido o expirado → null → 401.
 */
export class SupabaseAuthContext implements AuthContext {
  constructor(private readonly client: SupabaseAuthClient) {}

  async autenticar(token: string): Promise<Actor | null> {
    try {
      const { data, error } = await this.client.auth.getClaims(token);
      if (error || !data?.claims) return null;
      return actorDesdeClaims(data.claims);
    } catch {
      return null;
    }
  }
}
