/**
 * Convierte el contrato OpenAPI 3 que publica la API (GET /openapi.json) en una
 * estructura simple para la página de documentación. Solo cubre lo que usa el
 * contrato del módulo: tags, parámetros, cuerpos JSON y esquemas con $ref.
 */

interface Esquema {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: Esquema;
  properties?: Record<string, Esquema>;
  required?: string[];
  description?: string;
  example?: unknown;
  default?: unknown;
  nullable?: boolean;
  allOf?: Esquema[];
  minItems?: number;
}

interface Operacion {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: unknown[];
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: Esquema;
  }>;
  requestBody?: { content?: Record<string, { schema?: Esquema }> };
  responses?: Record<
    string,
    { description?: string; content?: Record<string, { schema?: Esquema }> }
  >;
}

export interface OpenApiDoc {
  info?: { title?: string; version?: string; description?: string };
  servers?: Array<{ url: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths?: Record<string, Record<string, Operacion>>;
  components?: { schemas?: Record<string, Esquema> };
}

export interface Campo {
  nombre: string;
  tipo: string;
  requerido: boolean;
  descripcion?: string;
}

export interface Parametro extends Campo {
  ubicacion: string;
}

export interface Respuesta {
  codigo: string;
  descripcion: string;
  tipo?: string;
}

export interface Endpoint {
  id: string;
  metodo: string;
  ruta: string;
  resumen: string;
  descripcion?: string;
  protegido: boolean;
  parametros: Parametro[];
  cuerpo?: { tipo: string; campos: Campo[]; ejemplo: unknown };
  respuestas: Respuesta[];
}

export interface GrupoEndpoints {
  nombre: string;
  descripcion?: string;
  endpoints: Endpoint[];
}

export interface DocumentacionApi {
  titulo: string;
  version: string;
  descripcion: string;
  baseUrl: string;
  grupos: GrupoEndpoints[];
}

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function nombreRef(ref: string): string {
  return ref.split('/').at(-1) ?? ref;
}

function resolver(doc: OpenApiDoc, esquema: Esquema | undefined): Esquema | undefined {
  if (!esquema) return undefined;
  if (esquema.$ref) return resolver(doc, doc.components?.schemas?.[nombreRef(esquema.$ref)]);
  if (esquema.allOf?.length === 1) {
    return { ...resolver(doc, esquema.allOf[0]), nullable: esquema.nullable };
  }
  return esquema;
}

/** Texto corto del tipo: "string (date)", "PENDIENTE | PAGADO", "Venta[]", "Venta | null". */
export function describirTipo(doc: OpenApiDoc, esquema: Esquema | undefined): string {
  if (!esquema) return '—';
  if (esquema.$ref) return nombreRef(esquema.$ref);
  if (esquema.allOf?.length === 1) {
    const base = describirTipo(doc, esquema.allOf[0]);
    return esquema.nullable ? `${base} | null` : base;
  }
  let tipo: string;
  if (esquema.enum) tipo = esquema.enum.map(String).join(' | ');
  else if (esquema.type === 'array') tipo = `${describirTipo(doc, esquema.items)}[]`;
  else tipo = esquema.format ? `${esquema.type} (${esquema.format})` : (esquema.type ?? 'object');
  return esquema.nullable ? `${tipo} | null` : tipo;
}

/** Ejemplo armado con los `example`/`enum`/`default` del esquema. */
export function ejemploDe(doc: OpenApiDoc, esquema: Esquema | undefined, profundidad = 0): unknown {
  const e = resolver(doc, esquema);
  if (!e || profundidad > 5) return null;
  if (e.example !== undefined) return e.example;
  if (e.enum?.length) return e.enum[0];
  if (e.default !== undefined) return e.default;
  if (e.type === 'array') return [ejemploDe(doc, e.items, profundidad + 1)];
  if (e.type === 'object' || e.properties) {
    return Object.fromEntries(
      Object.entries(e.properties ?? {}).map(([k, v]) => [k, ejemploDe(doc, v, profundidad + 1)]),
    );
  }
  if (e.type === 'integer' || e.type === 'number') return 0;
  if (e.type === 'boolean') return true;
  if (e.format === 'date') return '2026-10-16';
  if (e.format === 'date-time') return '2026-10-16T10:00:00-05:00';
  return 'string';
}

function camposDe(doc: OpenApiDoc, esquema: Esquema | undefined): Campo[] {
  const e = resolver(doc, esquema);
  const requeridos = new Set(e?.required ?? []);
  return Object.entries(e?.properties ?? {}).map(([nombre, prop]) => ({
    nombre,
    tipo: describirTipo(doc, prop),
    requerido: requeridos.has(nombre),
    ...(prop.description ? { descripcion: prop.description } : {}),
  }));
}

function primerEsquema(content: Record<string, { schema?: Esquema }> | undefined) {
  return content ? Object.values(content)[0]?.schema : undefined;
}

export function leerOpenApi(doc: OpenApiDoc): DocumentacionApi {
  const grupos = new Map<string, GrupoEndpoints>();
  for (const t of doc.tags ?? []) {
    grupos.set(t.name, {
      nombre: t.name,
      ...(t.description ? { descripcion: t.description } : {}),
      endpoints: [],
    });
  }

  for (const [ruta, operaciones] of Object.entries(doc.paths ?? {})) {
    for (const metodo of METODOS) {
      const op = operaciones[metodo];
      if (!op) continue;
      const cuerpo = primerEsquema(op.requestBody?.content);
      const endpoint: Endpoint = {
        id: `${metodo}-${ruta}`,
        metodo: metodo.toUpperCase(),
        ruta,
        resumen: op.summary ?? '',
        ...(op.description ? { descripcion: op.description } : {}),
        protegido: (op.security?.length ?? 0) > 0,
        parametros: (op.parameters ?? []).map((p) => ({
          nombre: p.name,
          ubicacion: p.in,
          tipo: describirTipo(doc, p.schema),
          requerido: p.required ?? p.in === 'path',
          ...(p.description ? { descripcion: p.description } : {}),
        })),
        ...(cuerpo
          ? {
              cuerpo: {
                tipo: describirTipo(doc, cuerpo),
                campos: camposDe(doc, cuerpo),
                ejemplo: ejemploDe(doc, cuerpo),
              },
            }
          : {}),
        respuestas: Object.entries(op.responses ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([codigo, r]) => {
            const esquema = primerEsquema(r.content);
            return {
              codigo,
              descripcion: r.description ?? '',
              ...(esquema ? { tipo: describirTipo(doc, esquema) } : {}),
            };
          }),
      };
      const tag = op.tags?.[0] ?? 'Otros';
      if (!grupos.has(tag)) grupos.set(tag, { nombre: tag, endpoints: [] });
      grupos.get(tag)!.endpoints.push(endpoint);
    }
  }

  return {
    titulo: doc.info?.title ?? 'API',
    version: doc.info?.version ?? '',
    descripcion: doc.info?.description ?? '',
    baseUrl: doc.servers?.[0]?.url ?? '',
    grupos: [...grupos.values()].filter((g) => g.endpoints.length > 0),
  };
}
