import { describe, expect, it } from 'vitest';
import { describirTipo, ejemploDe, leerOpenApi, type OpenApiDoc } from './openapi';

const doc: OpenApiDoc = {
  info: { title: 'API Contabilidad', version: '0.1.0', description: 'Use Bearer' },
  servers: [{ url: '/api/v1/contabilidad' }],
  tags: [
    { name: 'Sistema', description: 'Estado' },
    { name: 'Ventas', description: 'Ventas registradas' },
    { name: 'Vacío' },
  ],
  components: {
    schemas: {
      Linea: {
        type: 'object',
        required: ['vendedorId'],
        properties: {
          vendedorId: { type: 'string', example: 'V-1' },
          valorBruto: { type: 'string', example: '100000.00' },
        },
      },
      Orden: {
        type: 'object',
        required: ['numeroOrden', 'lineas'],
        properties: {
          numeroOrden: { type: 'string', example: 'ORD-1', description: 'Número de la orden' },
          version: { type: 'integer', enum: [1] },
          fecha: { type: 'string', format: 'date-time' },
          lineas: { type: 'array', items: { $ref: '#/components/schemas/Linea' } },
        },
      },
      Venta: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
    },
  },
  paths: {
    '/health': {
      get: { tags: ['Sistema'], summary: 'Estado', responses: { '200': { description: 'OK' } } },
    },
    '/eventos/orden-confirmada': {
      post: {
        tags: ['Ventas'],
        summary: 'Registra una orden',
        description: 'Webhook de Órdenes',
        security: [{ bearer: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Orden' } } },
        },
        responses: {
          '409': { description: 'Duplicada' },
          '201': {
            description: 'Procesado',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Venta' } },
              },
            },
          },
        },
      },
    },
    '/ventas': {
      get: {
        tags: ['Ventas'],
        summary: 'Lista ventas',
        security: [{ bearer: [] }],
        parameters: [
          {
            name: 'estado',
            in: 'query',
            schema: { type: 'string', enum: ['PENDIENTE', 'PAGADO'] },
          },
          { name: 'id', in: 'path', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Página' } },
      },
    },
    '/sin-tag': { get: { summary: 'Otro', responses: {} } },
  },
};

describe('leerOpenApi', () => {
  const api = leerOpenApi(doc);

  it('lee los datos generales', () => {
    expect(api).toMatchObject({
      titulo: 'API Contabilidad',
      version: '0.1.0',
      descripcion: 'Use Bearer',
      baseUrl: '/api/v1/contabilidad',
    });
  });

  it('agrupa por tag en el orden declarado y omite grupos vacíos', () => {
    expect(api.grupos.map((g) => [g.nombre, g.endpoints.length])).toEqual([
      ['Sistema', 1],
      ['Ventas', 2],
      ['Otros', 1],
    ]);
    expect(api.grupos[1]?.descripcion).toBe('Ventas registradas');
  });

  it('describe el cuerpo con el $ref resuelto, sus campos y un ejemplo', () => {
    const post = api.grupos[1]!.endpoints[0]!;
    expect(post).toMatchObject({
      metodo: 'POST',
      ruta: '/eventos/orden-confirmada',
      protegido: true,
    });
    expect(post.cuerpo?.tipo).toBe('Orden');
    expect(post.cuerpo?.campos).toEqual([
      { nombre: 'numeroOrden', tipo: 'string', requerido: true, descripcion: 'Número de la orden' },
      { nombre: 'version', tipo: '1', requerido: false },
      { nombre: 'fecha', tipo: 'string (date-time)', requerido: false },
      { nombre: 'lineas', tipo: 'Linea[]', requerido: true },
    ]);
    expect(post.cuerpo?.ejemplo).toEqual({
      numeroOrden: 'ORD-1',
      version: 1,
      fecha: '2026-10-16T10:00:00-05:00',
      lineas: [{ vendedorId: 'V-1', valorBruto: '100000.00' }],
    });
  });

  it('ordena las respuestas por código e indica su tipo', () => {
    const post = api.grupos[1]!.endpoints[0]!;
    expect(post.respuestas).toEqual([
      { codigo: '201', descripcion: 'Procesado', tipo: 'Venta[]' },
      { codigo: '409', descripcion: 'Duplicada' },
    ]);
  });

  it('lista los parámetros (los de ruta son obligatorios)', () => {
    const get = api.grupos[1]!.endpoints[1]!;
    expect(get.parametros).toEqual([
      { nombre: 'estado', ubicacion: 'query', tipo: 'PENDIENTE | PAGADO', requerido: false },
      { nombre: 'id', ubicacion: 'path', tipo: 'string', requerido: true },
    ]);
    expect(api.grupos[0]!.endpoints[0]!.protegido).toBe(false);
  });
});

describe('describirTipo y ejemploDe', () => {
  it('maneja nulos y allOf de un solo esquema', () => {
    const esquema = { allOf: [{ $ref: '#/components/schemas/Venta' }], nullable: true };
    expect(describirTipo(doc, esquema)).toBe('Venta | null');
    expect(ejemploDe(doc, esquema)).toEqual({ id: 'string' });
    expect(describirTipo(doc, { type: 'string', nullable: true })).toBe('string | null');
  });
});
