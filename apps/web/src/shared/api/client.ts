import type { ProblemDetails } from '@contabilidad/contracts';

/** Error de la API con el detalle problem+json devuelto por el backend. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
  ) {
    super(problem?.detail ?? problem?.title ?? `Error HTTP ${status}`);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Cliente HTTP del módulo. La URL base y el token los provee el host (standalone o marketplace). */
export function createApiClient({ baseUrl, getToken, fetchFn = fetch }: ApiClientOptions) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';

    const res = await fetchFn(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const esJson = res.headers.get('content-type')?.includes('json') ?? false;
    const data: unknown = esJson ? await res.json() : null;
    if (!res.ok) throw new ApiError(res.status, (data as ProblemDetails | null) ?? null);
    return data as T;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  };
}
