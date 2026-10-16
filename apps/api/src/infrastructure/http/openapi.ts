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
    tags: [
      { name: 'Sistema', description: 'Estado del módulo y usuario autenticado.' },
      {
        name: 'Comisiones',
        description: 'Porcentaje de comisión del marketplace con fechas de vigencia (HU-CON-09).',
      },
      {
        name: 'Ventas',
        description:
          'Registro automático de órdenes confirmadas y consulta de ventas con su comisión (HU-CON-01, HU-CON-02).',
      },
      {
        name: 'Cuentas por pagar',
        description: 'Saldos a pagar a cada vendedor por quincena (HU-CON-03).',
      },
      {
        name: 'Conciliación',
        description:
          'Pagos recibidos de la pasarela y su conciliación contra órdenes; la diferencia ' +
          'decide el estado CONCILIADA o PENDIENTE (HU-CON-04).',
      },
    ],
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
        OrdenConfirmada: {
          type: 'object',
          description: 'Evento orden.confirmada v1 (docs/fase0/contratos-integracion.md)',
          required: [
            'eventId',
            'version',
            'ocurridoEn',
            'tipo',
            'numeroOrden',
            'fecha',
            'estado',
            'moneda',
            'lineas',
          ],
          properties: {
            eventId: { type: 'string', example: 'evt-001' },
            version: { type: 'integer', enum: [1] },
            ocurridoEn: { type: 'string', format: 'date-time' },
            tipo: { type: 'string', enum: ['orden.confirmada'] },
            numeroOrden: { type: 'string', example: 'ORD-1001' },
            fecha: { type: 'string', format: 'date-time', example: '2026-10-05T09:58:00-05:00' },
            estado: {
              type: 'string',
              example: 'CONFIRMADA',
              description: 'Solo CONFIRMADA genera registro; otro valor responde IGNORADO',
            },
            moneda: { type: 'string', enum: ['COP'] },
            lineas: {
              type: 'array',
              minItems: 1,
              description: 'Una línea por vendedor',
              items: {
                type: 'object',
                required: ['vendedorId', 'valorBruto'],
                properties: {
                  vendedorId: { type: 'string', example: 'V-1' },
                  valorBruto: { type: 'string', example: '100000.00' },
                  categoriaId: { type: 'string', example: 'CAT-9' },
                },
              },
            },
          },
        },
        EventoProcesado: {
          type: 'object',
          properties: {
            eventId: { type: 'string' },
            resultado: { type: 'string', enum: ['PROCESADO', 'YA_PROCESADO', 'IGNORADO'] },
            detalle: { type: 'string' },
          },
        },
        Venta: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            numeroOrden: { type: 'string' },
            vendedorId: { type: 'string' },
            categoriaId: { type: 'string', nullable: true },
            fecha: { type: 'string', format: 'date-time' },
            fechaContable: { type: 'string', format: 'date' },
            periodo: { type: 'string', example: '2026-10-Q1' },
            valorBruto: { type: 'string', example: '100000.00' },
            porcentajeAplicado: { type: 'string', nullable: true, example: '10.0000' },
            comision: { type: 'string', nullable: true, example: '10000.00' },
            valorNeto: { type: 'string', nullable: true, example: '90000.00' },
          },
        },
        CuentaPorPagar: {
          type: 'object',
          properties: {
            vendedorId: { type: 'string', example: 'V-1' },
            periodo: { type: 'string', example: '2026-10-Q1' },
            totalNeto: { type: 'string', example: '135000.00' },
            valorPagado: { type: 'string', example: '0.00' },
            saldoPendiente: { type: 'string', example: '135000.00' },
            estado: { type: 'string', enum: ['PENDIENTE', 'PAGADO'] },
          },
        },
        PagoRecibido: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            referenciaPasarela: { type: 'string', example: 'PSE-889' },
            fecha: { type: 'string', format: 'date-time' },
            fechaContable: { type: 'string', format: 'date' },
            valor: { type: 'string', example: '150000.00' },
            origen: { type: 'string', enum: ['API', 'CSV', 'MANUAL'] },
            ordenesInformadas: { type: 'array', items: { type: 'string' } },
            estado: { type: 'string', enum: ['SIN_CONCILIAR', 'CONCILIADO', 'PENDIENTE'] },
            conciliacionId: { type: 'string', format: 'uuid', nullable: true },
            diferencia: { type: 'string', nullable: true, example: '0.00' },
          },
        },
        PagoRecibidoEvento: {
          type: 'object',
          description: 'Evento pago.recibido v1 (docs/fase0/contratos-integracion.md)',
          required: [
            'eventId',
            'version',
            'ocurridoEn',
            'tipo',
            'referenciaPasarela',
            'fecha',
            'valor',
            'moneda',
            'origen',
          ],
          properties: {
            eventId: { type: 'string', example: 'evt-p1' },
            version: { type: 'integer', enum: [1] },
            ocurridoEn: { type: 'string', format: 'date-time' },
            tipo: { type: 'string', enum: ['pago.recibido'] },
            referenciaPasarela: { type: 'string', example: 'PSE-889' },
            fecha: { type: 'string', format: 'date-time', example: '2026-10-16T10:00:00-05:00' },
            valor: { type: 'string', example: '150000.00' },
            moneda: { type: 'string', enum: ['COP'] },
            origen: { type: 'string', enum: ['API', 'CSV', 'MANUAL'] },
            ordenes: {
              type: 'array',
              items: { type: 'string', example: 'ORD-1001' },
              description: 'Opcional: si viene, el pago se concilia automáticamente',
            },
          },
        },
        PagoRecibidoProcesado: {
          type: 'object',
          properties: {
            eventId: { type: 'string' },
            resultado: { type: 'string', enum: ['PROCESADO', 'YA_PROCESADO'] },
            pagoId: { type: 'string', format: 'uuid' },
            estado: { type: 'string', enum: ['SIN_CONCILIAR', 'CONCILIADO', 'PENDIENTE'] },
            detalle: {
              type: 'string',
              description: 'Por qué no se concilió automáticamente (si aplica)',
            },
          },
        },
        ConciliarPago: {
          type: 'object',
          required: ['pagoId', 'ordenes'],
          properties: {
            pagoId: { type: 'string', format: 'uuid' },
            ordenes: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['numeroOrden'],
                properties: {
                  numeroOrden: { type: 'string', example: 'ORD-1001' },
                  valorAplicado: {
                    type: 'string',
                    example: '100000.00',
                    description: 'Opcional: por defecto, el saldo pendiente de la orden',
                  },
                },
              },
            },
          },
        },
        Conciliacion: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            pagoId: { type: 'string', format: 'uuid' },
            referenciaPasarela: { type: 'string' },
            fechaPago: { type: 'string', format: 'date-time' },
            valorPago: { type: 'string', example: '95000.00' },
            valorAplicado: { type: 'string', example: '100000.00' },
            diferencia: {
              type: 'string',
              example: '-5000.00',
              description: 'valorPago - valorAplicado',
            },
            estado: { type: 'string', enum: ['CONCILIADA', 'PENDIENTE'] },
            usuario: { type: 'string' },
            fecha: { type: 'string', format: 'date-time' },
            detalles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  numeroOrden: { type: 'string' },
                  valorOrden: { type: 'string' },
                  valorAplicado: { type: 'string' },
                },
              },
            },
          },
        },
        ImportacionPagos: {
          type: 'object',
          properties: {
            importados: { type: 'integer' },
            duplicados: { type: 'integer' },
            errores: { type: 'integer' },
            filas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  linea: { type: 'integer' },
                  referencia: { type: 'string' },
                  resultado: { type: 'string', enum: ['IMPORTADO', 'DUPLICADO', 'ERROR'] },
                  estado: { type: 'string', enum: ['SIN_CONCILIAR', 'CONCILIADO', 'PENDIENTE'] },
                  detalle: { type: 'string' },
                },
              },
            },
          },
        },
        PaginaVentas: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/Venta' } },
            page: { type: 'integer' },
            size: { type: 'integer' },
            total: { type: 'integer' },
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
      '/eventos/orden-confirmada': {
        post: {
          tags: ['Ventas'],
          summary:
            'Registra una orden confirmada: venta, comisión y cuenta por pagar por vendedor (HU-CON-01)',
          description:
            'Webhook del módulo de Órdenes (rol SISTEMA). Idempotente por eventId: un reenvío ' +
            'responde YA_PROCESADO sin duplicar registros.',
          security: [{ bearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/OrdenConfirmada' } },
            },
          },
          responses: {
            '201': {
              description: 'PROCESADO: ventas registradas',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/EventoProcesado' } },
              },
            },
            '200': {
              description: 'YA_PROCESADO (evento repetido) o IGNORADO (orden no confirmada)',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/EventoProcesado' } },
              },
            },
            '400': problema('El evento no cumple el contrato v1'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol SISTEMA'),
            '409': problema('ORDEN_DUPLICADA: la orden ya se registró con otro eventId'),
            '422': problema('COMISION_NO_CONFIGURADA: no hay porcentaje vigente en la fecha'),
          },
        },
      },
      '/ventas': {
        get: {
          tags: ['Ventas'],
          summary: 'Ventas registradas con el desglose de su comisión (HU-CON-01)',
          security: [{ bearer: [] }],
          parameters: [
            {
              name: 'desde',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'Fecha contable inicial (inclusive)',
            },
            {
              name: 'hasta',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'Fecha contable final (inclusive)',
            },
            {
              name: 'periodo',
              in: 'query',
              schema: { type: 'string', example: '2026-10-Q1' },
              description: 'Quincena de liquidación (AAAA-MM-Q1 o AAAA-MM-Q2)',
            },
            { name: 'vendedorId', in: 'query', schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'size',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
            },
          ],
          responses: {
            '200': {
              description: 'Página de ventas, de la más reciente a la más antigua',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/PaginaVentas' } },
              },
            },
            '400': problema('Filtros inválidos'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol CONTADOR o ADMIN_FINANCIERO'),
          },
        },
      },
      '/periodos': {
        get: {
          tags: ['Ventas'],
          summary: 'Quincenas con ventas registradas, de la más reciente a la más antigua',
          security: [{ bearer: [] }],
          responses: {
            '200': {
              description: 'Periodos disponibles',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      periodos: {
                        type: 'array',
                        items: { type: 'string', example: '2026-10-Q1' },
                      },
                    },
                  },
                },
              },
            },
            '401': problema('No autenticado'),
            '403': problema('Requiere rol CONTADOR o ADMIN_FINANCIERO'),
          },
        },
      },
      '/cuentas-por-pagar': {
        get: {
          tags: ['Cuentas por pagar'],
          summary: 'Saldo pendiente por vendedor y quincena (HU-CON-03)',
          security: [{ bearer: [] }],
          parameters: [
            {
              name: 'periodo',
              in: 'query',
              schema: { type: 'string', example: '2026-10-Q1' },
              description: 'Quincena (AAAA-MM-Q1 o AAAA-MM-Q2)',
            },
            {
              name: 'estado',
              in: 'query',
              schema: { type: 'string', enum: ['PENDIENTE', 'PAGADO'] },
            },
            { name: 'vendedorId', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Cuentas por pagar, de la quincena más reciente a la más antigua',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/CuentaPorPagar' } },
                },
              },
            },
            '400': problema('Filtros inválidos'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol CONTADOR o ADMIN_FINANCIERO'),
          },
        },
      },
      '/eventos/pago-recibido': {
        post: {
          tags: ['Conciliación'],
          summary: 'Registra un pago recibido de la pasarela (HU-CON-04)',
          description:
            'Webhook del módulo de Pagos (rol SISTEMA). Idempotente por eventId; la misma ' +
            'referencia con otro eventId responde 409. Si trae órdenes, se concilia automáticamente.',
          security: [{ bearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/PagoRecibidoEvento' } },
            },
          },
          responses: {
            '201': {
              description: 'PROCESADO',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PagoRecibidoProcesado' },
                },
              },
            },
            '200': {
              description: 'YA_PROCESADO (evento repetido)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PagoRecibidoProcesado' },
                },
              },
            },
            '400': problema('El evento no cumple el contrato v1'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol SISTEMA'),
            '409': problema('REFERENCIA_DUPLICADA: ya existe un pago con esa referencia'),
          },
        },
      },
      '/pagos-recibidos/importar': {
        post: {
          tags: ['Conciliación'],
          summary: 'Importa pagos recibidos desde un CSV de la pasarela',
          description:
            'Columnas: referencia,fecha,valor,ordenes (órdenes separadas por ";"; fecha ' +
            'AAAA-MM-DD o ISO 8601). Cada fila se registra por separado.',
          security: [{ bearer: [] }],
          requestBody: {
            required: true,
            content: {
              'text/csv': {
                schema: { type: 'string' },
                example:
                  'referencia,fecha,valor,ordenes\nPSE-900,2026-10-16,150000.00,ORD-1001;ORD-1002',
              },
            },
          },
          responses: {
            '200': {
              description: 'Resultado por fila',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ImportacionPagos' } },
              },
            },
            '400': problema('CSV inválido (encabezado o archivo vacío)'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol CONTADOR'),
          },
        },
      },
      '/pagos-recibidos': {
        get: {
          tags: ['Conciliación'],
          summary: 'Bandeja de pagos recibidos con su estado de conciliación',
          security: [{ bearer: [] }],
          parameters: [
            {
              name: 'estado',
              in: 'query',
              schema: { type: 'string', enum: ['SIN_CONCILIAR', 'CONCILIADO', 'PENDIENTE'] },
            },
            {
              name: 'desde',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'Fecha contable inicial del pago (inclusive)',
            },
            {
              name: 'hasta',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'Fecha contable final del pago (inclusive)',
            },
          ],
          responses: {
            '200': {
              description: 'Pagos, del más reciente al más antiguo',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/PagoRecibido' } },
                },
              },
            },
            '400': problema('Filtros inválidos'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol CONTADOR o ADMIN_FINANCIERO'),
          },
        },
      },
      '/conciliaciones': {
        post: {
          tags: ['Conciliación'],
          summary: 'Concilia un pago recibido contra una o varias órdenes',
          description:
            'Diferencia = valor del pago - valor aplicado. Con tolerancia 0 (D-08): sin diferencia ' +
            'queda CONCILIADA; con diferencia, PENDIENTE. Lo aplicado a una orden no puede superar su valor.',
          security: [{ bearer: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ConciliarPago' } },
            },
          },
          responses: {
            '201': {
              description: 'Conciliación registrada',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Conciliacion' } },
              },
            },
            '400': problema('Datos inválidos'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol CONTADOR'),
            '404': problema('PAGO_INEXISTENTE u ORDEN_INEXISTENTE'),
            '409': problema('CONCILIACION_DUPLICADA: el pago ya está conciliado'),
            '422': problema('APLICADO_EXCEDE_SALDO: se aplica más que el saldo de la orden'),
          },
        },
        get: {
          tags: ['Conciliación'],
          summary: 'Conciliaciones con su diferencia (semáforo CONCILIADA / PENDIENTE)',
          security: [{ bearer: [] }],
          parameters: [
            {
              name: 'estado',
              in: 'query',
              schema: { type: 'string', enum: ['CONCILIADA', 'PENDIENTE'] },
            },
            {
              name: 'desde',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'Fecha contable inicial del pago (inclusive)',
            },
            {
              name: 'hasta',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'Fecha contable final del pago (inclusive)',
            },
          ],
          responses: {
            '200': {
              description: 'Conciliaciones, de la más reciente a la más antigua',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Conciliacion' } },
                },
              },
            },
            '400': problema('Filtros inválidos'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol CONTADOR o ADMIN_FINANCIERO'),
          },
        },
      },
      '/conciliaciones/{id}': {
        get: {
          tags: ['Conciliación'],
          summary: 'Detalle de una conciliación con sus órdenes',
          security: [{ bearer: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Conciliación',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Conciliacion' } },
              },
            },
            '400': problema('Identificador inválido'),
            '401': problema('No autenticado'),
            '403': problema('Requiere rol CONTADOR o ADMIN_FINANCIERO'),
            '404': problema('No existe la conciliación'),
          },
        },
      },
    },
  };
}
