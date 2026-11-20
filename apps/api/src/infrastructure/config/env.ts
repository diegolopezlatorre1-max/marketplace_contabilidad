import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  INTEGRATION_MODE: z.enum(['mock', 'http', 'events']).default('mock'),
  AUTH_MODE: z.enum(['mock', 'jwt']).default('mock'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
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
