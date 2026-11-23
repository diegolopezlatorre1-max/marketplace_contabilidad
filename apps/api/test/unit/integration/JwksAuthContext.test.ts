import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  emisorSupabase,
  JwksAuthContext,
} from '../../../src/infrastructure/integration/auth/JwksAuthContext';

const URL_PROYECTO = 'https://abc.supabase.co';
const EMISOR = 'https://abc.supabase.co/auth/v1';
const UUID = '7b0c1d2e-0000-4000-8000-000000000001';

type Clave = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let auth: JwksAuthContext;
let privada: Clave;
let otraPrivada: Clave;

/** Firma un access token como lo emite Supabase (ES256, kid del JWKS). */
function firmar(
  payload: JWTPayload,
  opciones: { clave?: Clave; emisor?: string; audiencia?: string; expira?: string | number } = {},
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setIssuer(opciones.emisor ?? EMISOR)
    .setAudience(opciones.audiencia ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opciones.expira ?? '1h')
    .sign(opciones.clave ?? privada);
}

beforeAll(async () => {
  const par = await generateKeyPair('ES256');
  privada = par.privateKey;
  otraPrivada = (await generateKeyPair('ES256')).privateKey;
  const jwk = { ...(await exportJWK(par.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
  auth = new JwksAuthContext({
    supabaseUrl: URL_PROYECTO,
    claves: createLocalJWKSet({ keys: [jwk] }),
  });
});

describe('JwksAuthContext', () => {
  it('acepta un token firmado con la clave del proyecto y mapea el rol', async () => {
    const token = await firmar({
      sub: UUID,
      email: 'a@example.com',
      app_metadata: { role: 'admin' },
    });
    expect(await auth.autenticar(token)).toEqual({
      id: UUID,
      nombre: 'a@example.com',
      roles: ['ADMIN'],
    });
  });

  it('un VENDEDOR usa app_metadata.vendedor_id si existe', async () => {
    const token = await firmar({
      sub: UUID,
      app_metadata: { role: 'vendedor', vendedor_id: 'V-1' },
    });
    expect(await auth.autenticar(token)).toMatchObject({ roles: ['VENDEDOR'], vendedorId: 'V-1' });
  });

  it('rechaza una firma que no es del proyecto', async () => {
    const token = await firmar({ sub: UUID }, { clave: otraPrivada });
    expect(await auth.autenticar(token)).toBeNull();
  });

  it('rechaza un token expirado', async () => {
    const token = await firmar({ sub: UUID }, { expira: Math.floor(Date.now() / 1000) - 60 });
    expect(await auth.autenticar(token)).toBeNull();
  });

  it('rechaza otro emisor u otra audiencia', async () => {
    expect(
      await auth.autenticar(
        await firmar({ sub: UUID }, { emisor: 'https://otro.supabase.co/auth/v1' }),
      ),
    ).toBeNull();
    expect(await auth.autenticar(await firmar({ sub: UUID }, { audiencia: 'anon' }))).toBeNull();
  });

  it('rechaza un token HS256 y basura', async () => {
    const hs256 = await new SignJWT({ sub: UUID })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(EMISOR)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('secreto-compartido-de-32-bytes!!'));
    expect(await auth.autenticar(hs256)).toBeNull();
    expect(await auth.autenticar('no-es-un-jwt')).toBeNull();
  });
});

describe('emisorSupabase', () => {
  it('arma el emisor de la URL del proyecto, con o sin barra final', () => {
    expect(emisorSupabase('https://abc.supabase.co/')).toBe(EMISOR);
    expect(emisorSupabase(URL_PROYECTO)).toBe(EMISOR);
  });
});
