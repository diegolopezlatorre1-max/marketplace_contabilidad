/**
 * Contrato OpenAPI publicado en /api/v1/contabilidad/docs.
 * Cada sprint agrega aquí los endpoints de sus historias.
 */
export function buildOpenApi(version: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'API Módulo de Contabilidad - Marketplace',
      version,
      description:
        'API REST del módulo de contabilidad. Autenticación: `Authorization: Bearer <token>`. ' +
        'En desarrollo (AUTH_MODE=mock) use `mock-contador`, `mock-admin` o `mock-sistema`. ' +
        'Los montos viajan como string decimal con 2 decimales.',
    },
    servers: [{ url: '/api/v1/contabilidad' }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        Problem: {
          type: 'object',
          required: ['type', 'title', 'status', 'code'],
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'integer' },
            detail: { type: 'string' },
            code: { type: 'string' },
            correlationId: { type: 'string' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: { path: { type: 'string' }, message: { type: 'string' } },
              },
            },
          },
        },
        Health: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'degradado'] },
            modulo: { type: 'string' },
            version: { type: 'string' },
            integrationMode: { type: 'string', enum: ['mock', 'http', 'events'] },
            checks: {
              type: 'object',
              properties: { baseDeDatos: { type: 'string', enum: ['ok', 'error'] } },
            },
            fecha: { type: 'string', format: 'date-time' },
          },
        },
        UsuarioActual: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            nombre: { type: 'string' },
            roles: {
              type: 'array',
              items: { type: 'string', enum: ['CONTADOR', 'ADMIN_FINANCIERO', 'SISTEMA'] },
            },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Sistema'],
          summary: 'Estado del módulo y de la base de datos',
          responses: {
            '200': {
              description: 'Módulo operativo',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } },
            },
            '503': {
              description: 'Módulo degradado (BD no disponible)',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } },
            },
          },
        },
      },
      '/me': {
        get: {
          tags: ['Sistema'],
          summary: 'Usuario autenticado y sus roles',
          security: [{ bearer: [] }],
          responses: {
            '200': {
              description: 'Usuario actual',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/UsuarioActual' } },
              },
            },
            '401': {
              description: 'No autenticado',
              content: {
                'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
              },
            },
          },
        },
      },
    },
  };
}
