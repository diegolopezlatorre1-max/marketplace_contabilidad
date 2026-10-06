import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

function respuesta(status: number, body: unknown, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

describe('createApiClient', () => {
  it('envía el token Bearer y devuelve el JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuesta(200, { ok: true }));
    const api = createApiClient({ baseUrl: '/api', getToken: () => 'mock-contador', fetchFn });

    await expect(api.get('/me')).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledWith('/api/me', {
      method: 'GET',
      headers: { accept: 'application/json', authorization: 'Bearer mock-contador' },
    });
  });

  it('lanza ApiError con el problem+json del backend', async () => {
    const problem = { type: 't', title: 'No autenticado', status: 401, code: 'NO_AUTENTICADO' };
    const fetchFn = vi.fn().mockResolvedValue(respuesta(401, problem, 'application/problem+json'));
    const api = createApiClient({ baseUrl: '', getToken: () => null, fetchFn });

    const error = await api.get('/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).problem?.code).toBe('NO_AUTENTICADO');
  });
});
