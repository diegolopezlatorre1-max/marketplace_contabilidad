const problema = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
});

const estadoComision = {
  description: 'Porcentaje vigente en la fecha e historial de vigencias',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/ConfiguracionComision' } },
  },
};

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
        VigenciaComision: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            porcentaje: { type: 'string', example: '10.0000' },
            alcance: { type: 'string', enum: ['GLOBAL', 'VENDEDOR', 'CATEGORIA'] },
            referenciaId: { type: 'string', nullable: true },
            vigenteDesde: { type: 'string', format: 'date' },
            vigenteHasta: {
              type: 'string',
              format: 'date',
              nullable: true,
              description: 'Inclusive; null = vigencia abierta',
            },
            creadoPor: { type: 'string' },
          },
        },
        ConfiguracionComision: {
          type: 'object',
          properties: {
            fecha: { type: 'string', format: 'date' },
            vigente: {
              allOf: [{ $ref: '#/components/schemas/VigenciaComision' }],
              nullable: true,
            },
            historial: { type: 'array', items: { $ref: '#/components/schemas/VigenciaComision' } },
          },
        },
        ConfigurarComision: {
          type: 'object',
          required: ['porcentaje', 'vigenteDesde'],
          properties: {
            porcentaje: {
              type: 'string',
              example: '12.5',
              description: 'Entre 0 y 100, máximo 4 decimales',
            },
            vigenteDesde: {
              type: 'string',
              format: 'date',
              example: '2026-10-16',
              description:
                'Día contable (hora de Colombia). Debe ser posterior al inicio de la vigencia actual.',
            },
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
      '/comisiones/configuracion': {
        get: {
          tags: ['Comisiones'],
          summary: 'Porcentaje de comisión GLOBAL vigente e historial (HU-CON-09)',
          security: [{ bearer: [] }],
          parameters: [
            {
              name: 'fecha',
              in: 'query',
              required: false,
              schema: { type: 'string', format: 'date' },
              description: 'Fecha a consultar (por defecto, hoy en hora de Colombia)',
            },
          ],
          responses: {
            '200': estadoComision,
            '400': problema('Fecha inválida'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol CONTADOR o ADMIN_FINANCIERO'),
          },
        },
        put: {
          tags: ['Comisiones'],
          summary:
            'Configura un nuevo porcentaje GLOBAL; la vigencia anterior se cierra el día previo',
          security: [{ bearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ConfigurarComision' } },
            },
          },
          responses: {
            '200': estadoComision,
            '400': problema('Datos inválidos'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol ADMIN_FINANCIERO'),
            '409': problema('La nueva vigencia se solaparía con la actual'),
          },
        },
      },
    },
  };
}
