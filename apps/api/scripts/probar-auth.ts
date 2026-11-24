import 'dotenv/config';
import { parseArgs } from 'node:util';
import { decodeJwt } from 'jose';
import { JwksAuthContext } from '../src/infrastructure/integration/auth/JwksAuthContext';

/**
 * Comprueba la autenticación con el proyecto Supabase central (AUTH_MODE=jwks) sin base de datos:
 * obtiene el access token de cada usuario, lo verifica con el JWKS del proyecto y muestra el rol que
 * detecta Contabilidad. Si se indica --api, también llama a GET /me de la API en ejecución.
 *
 *   npm run probar:auth -- --usuario admin@usc.edu.co:<clave> --usuario vendedor@usc.edu.co:<clave>
 *   npm run probar:auth -- --token <access_token>
 *   npm run probar:auth -- --usuario ... --api http://localhost:3000/api/contabilidad
 *
 * Variables: SUPABASE_URL (obligatoria) y SUPABASE_PUBLISHABLE_KEY (o --key; solo para iniciar
 * sesión con usuario y clave). También PRUEBA_USUARIOS="correo:clave,correo:clave" en apps/api/.env
 * para no dejar las claves en el historial de la terminal.
 */
const { values } = parseArgs({
  options: {
    usuario: { type: 'string', multiple: true },
    token: { type: 'string', multiple: true },
    key: { type: 'string' },
    api: { type: 'string' },
  },
});

const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
const publishableKey = values.key ?? process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
if (!supabaseUrl) {
  console.error('Defina SUPABASE_URL (https://<ref>.supabase.co) en apps/api/.env');
  process.exit(1);
}

const usuarios = [...(values.usuario ?? []), ...(process.env.PRUEBA_USUARIOS?.split(',') ?? [])]
  .map((u) => u.trim())
  .filter(Boolean)
  .map((u) => {
    const i = u.indexOf(':');
    return { correo: u.slice(0, i), clave: u.slice(i + 1) };
  });
const tokens = values.token ?? [];

if (!usuarios.length && !tokens.length) {
  console.error('Indique --usuario correo:clave, PRUEBA_USUARIOS o --token <access_token>');
  process.exit(1);
}

async function iniciarSesion(correo: string, clave: string): Promise<string> {
  if (!publishableKey) {
    throw new Error(
      'Iniciar sesión requiere SUPABASE_PUBLISHABLE_KEY (o --key); use --token si no la tiene',
    );
  }
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: publishableKey },
    body: JSON.stringify({ email: correo, password: clave }),
  });
  const cuerpo = (await res.json()) as { access_token?: string; msg?: string; message?: string };
  if (!res.ok || !cuerpo.access_token) {
    throw new Error(`Supabase respondió ${res.status}: ${cuerpo.msg ?? cuerpo.message ?? ''}`);
  }
  return cuerpo.access_token;
}

const auth = new JwksAuthContext({ supabaseUrl });

async function revisar(etiqueta: string, token: string): Promise<boolean> {
  console.log(`\n== ${etiqueta}`);
  // Solo para mostrar dónde viene el rol; la validación real la hace JwksAuthContext.
  const claims = decodeJwt(token);
  console.log('  claims:', {
    iss: claims.iss,
    aud: claims.aud,
    sub: claims.sub,
    expira: claims.exp ? new Date(claims.exp * 1000).toISOString() : undefined,
    role: claims.role,
    app_metadata: claims.app_metadata,
    user_metadata: claims.user_metadata,
  });

  const actor = await auth.autenticar(token);
  if (!actor) {
    console.log('  RESULTADO: token RECHAZADO (firma, emisor, audiencia o expiración) -> 401');
    return false;
  }
  console.log(`  RESULTADO: token válido. Roles detectados: [${actor.roles.join(', ')}]`);
  if (actor.vendedorId) console.log(`  vendedorId: ${actor.vendedorId}`);
  if (!actor.roles.length) {
    console.log('  AVISO: sin rol reconocido en app_metadata.role/roles -> 403 en todas las rutas');
  }

  if (values.api) {
    const res = await fetch(`${values.api.replace(/\/+$/, '')}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    console.log(`  GET /me -> HTTP ${res.status}`, JSON.stringify(await res.json()));
  }
  return actor.roles.length > 0;
}

let ok = true;
for (const { correo, clave } of usuarios) {
  try {
    ok = (await revisar(correo, await iniciarSesion(correo, clave))) && ok;
  } catch (e) {
    console.log(`\n== ${correo}\n  ERROR: ${(e as Error).message}`);
    ok = false;
  }
}
for (const [i, token] of tokens.entries()) {
  try {
    ok = (await revisar(`token ${i + 1}`, token)) && ok;
  } catch (e) {
    console.log(`\n== token ${i + 1}\n  ERROR: ${(e as Error).message}`);
    ok = false;
  }
}
process.exitCode = ok ? 0 : 1;
