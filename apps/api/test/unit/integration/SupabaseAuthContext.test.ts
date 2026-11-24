import { describe, expect, it } from 'vitest';
import {
  actorDesdeClaims,
  SupabaseAuthContext,
  type SupabaseAuthClient,
  type SupabaseClaims,
} from '../../../src/infrastructure/integration/auth/SupabaseAuthContext';

/** Cliente simulado: devuelve los claims del token si está en el mapa, si no un error. */
function cliente(tokens: Record<string, SupabaseClaims>): SupabaseAuthClient {
  return {
    auth: {
      getClaims: async (jwt: string) => {
        if (jwt === 'explota') throw new Error('red caída');
        const claims = tokens[jwt];
        return claims
          ? { data: { claims }, error: null }
          : { data: null, error: new Error('invalid JWT') };
      },
    },
  };
}

const UUID = '7b0c1d2e-0000-4000-8000-000000000001';

describe('SupabaseAuthContext', () => {
  const auth = new SupabaseAuthContext(
    cliente({
      admin: { sub: UUID, email: 'admin@example.com', app_metadata: { role: 'admin' } },
      vendedor: {
        sub: UUID,
        user_metadata: { full_name: 'Tienda Uno' },
        app_metadata: { role: 'Vendedor' },
      },
      sinRol: { sub: UUID, app_metadata: {} },
    }),
  );

  it('valida el token con Supabase y mapea el rol sin importar mayúsculas', async () => {
    expect(await auth.autenticar('admin')).toEqual({
      id: UUID,
      nombre: 'admin@example.com',
      roles: ['ADMIN'],
    });
  });

  it('un VENDEDOR se identifica con su UUID si no trae vendedor_id', async () => {
    expect(await auth.autenticar('vendedor')).toEqual({
      id: UUID,
      nombre: 'Tienda Uno',
      roles: ['VENDEDOR'],
      vendedorId: UUID,
    });
  });

  it('un token inválido, expirado o un fallo de red devuelven null (401)', async () => {
    expect(await auth.autenticar('expirado')).toBeNull();
    expect(await auth.autenticar('explota')).toBeNull();
  });

  it('un usuario sin rol conocido queda sin roles (403 en las rutas)', async () => {
    expect((await auth.autenticar('sinRol'))?.roles).toEqual([]);
  });
});

describe('actorDesdeClaims', () => {
  it('usa app_metadata.vendedor_id cuando existe y acepta una lista de roles', () => {
    expect(
      actorDesdeClaims({
        sub: UUID,
        app_metadata: { roles: ['VENDEDOR', 'COMPRADOR', 'desconocido'], vendedor_id: 'V-1' },
      }),
    ).toMatchObject({ roles: ['VENDEDOR', 'COMPRADOR'], vendedorId: 'V-1' });
  });

  it('rechaza claims sin sub', () => {
    expect(actorDesdeClaims({ app_metadata: { role: 'admin' } })).toBeNull();
  });

  it('no asigna vendedorId a quien no es VENDEDOR', () => {
    expect(
      actorDesdeClaims({ sub: UUID, app_metadata: { role: 'admin', vendedor_id: 'V-1' } }),
    ).not.toHaveProperty('vendedorId');
  });
});
