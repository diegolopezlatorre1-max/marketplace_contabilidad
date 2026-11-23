import { z } from 'zod';
import { parseServiceApiKeys } from '../integration/auth/ApiKeyServiceAuth';
import { parseDestinosOutbox } from '../messaging/OutboxRelay';
import { MODOS_SSL } from '../persistence/postgres/pool';

const opcional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().url(),
    // TLS hacia PostgreSQL: disable (local/CI) | verify (Supabase con su CA) | no-verify.
    DATABASE_SSL: z.enum(MODOS_SSL).default('disable'),
    DATABASE_SSL_CA: opcional,
    INTEGRATION_MODE: z.enum(['mock', 'http', 'events']).default('mock'),
    // mock: tokens fijos de desarrollo | supabase: access token validado con Supabase Auth
    // (getClaims, requiere publishable key) | jwks: firma verificada con el JWKS del proyecto.
    AUTH_MODE: z.enum(['mock', 'supabase', 'jwks']).default('mock'),
    SUPABASE_URL: opcional.pipe(z.string().url().optional()),
    // Publishable key (sb_publishable_...) o anon key del proyecto. Es pública.
    SUPABASE_PUBLISHABLE_KEY: opcional,
    // Claves de los módulos que envían eventos: "ordenes:clave1,pagos:clave2". Secreto.
    SERVICE_API_KEYS: z
      .string()
      .optional()
      .transform((v, ctx) => {
        try {
          return parseServiceApiKeys(v);
        } catch (e) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message });
          return z.NEVER;
        }
      }),
    // Relay del outbox: a dónde se entrega cada tipo de evento ("tipo=https://...,*=https://...").
    // Sin destinos, los eventos quedan PENDIENTES en el outbox.
    OUTBOX_DESTINOS: z
      .string()
      .optional()
      .transform((v, ctx) => {
        try {
          return parseDestinosOutbox(v);
        } catch (e) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message });
          return z.NEVER;
        }
      }),
    // Clave que se envía en x-api-key a los destinos (si la exigen). Secreto.
    OUTBOX_API_KEY: opcional,
    OUTBOX_INTERVALO_MS: z.coerce.number().int().positive().default(5_000),
    OUTBOX_LOTE: z.coerce.number().int().positive().max(500).default(20),
    OUTBOX_MAX_INTENTOS: z.coerce.number().int().positive().default(8),
    OUTBOX_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    // Límite de peticiones por IP y ventana (GUIA_EQUIPO_6, sección 7).
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_GENERAL: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_EVENTOS: z.coerce.number().int().positive().default(3_000),
    RATE_LIMIT_EXPORTACIONES: z.coerce.number().int().positive().default(20),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.AUTH_MODE === 'supabase') {
      for (const clave of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const) {
        if (!cfg[clave]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [clave],
            message: 'Obligatorio con AUTH_MODE=supabase',
          });
        }
      }
    }
    if (cfg.AUTH_MODE === 'jwks' && !cfg.SUPABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_URL'],
        message: 'Obligatorio con AUTH_MODE=jwks',
      });
    }
    if (cfg.NODE_ENV === 'production' && Object.keys(cfg.SERVICE_API_KEYS).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SERVICE_API_KEYS'],
        message: 'Obligatorio en producción: los otros módulos no podrían enviar eventos',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

/** Valida las variables de entorno al arrancar: si falta algo, el proceso no inicia. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const detalle = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración inválida:\n${detalle}`);
  }
  if (result.data.AUTH_MODE === 'mock' && result.data.NODE_ENV === 'production') {
    throw new Error('AUTH_MODE=mock no está permitido en producción');
  }
  return result.data;
}
