/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { ApiError, NetworkError } from '../errors';
import { request } from '../request';

const BASE = 'http://test/api';

// React Native's FormData type lacks the readers that Node's implementation has.
type ServerForm = { get(name: string): unknown };
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('request', () => {
  it('sends JSON and Bearer, parses JSON', async () => {
    let seenAuth: string | null = null;
    let seenBody: unknown;
    let seenContentType: string | null = null;
    server.use(
      http.post(`${BASE}/things`, async ({ request: req }) => {
        seenAuth = req.headers.get('authorization');
        seenContentType = req.headers.get('content-type');
        seenBody = await req.json();
        return HttpResponse.json({ ok: true });
      }),
    );

    const result = await request<{ ok: boolean }>(BASE, '/things', {
      method: 'POST',
      body: { a: 1 },
      token: 't1',
    });

    expect(result).toEqual({ ok: true });
    expect(seenAuth).toBe('Bearer t1');
    expect(seenContentType).toBe('application/json');
    expect(seenBody).toEqual({ a: 1 });
  });

  it('sends a FormData body as-is without a JSON Content-Type', async () => {
    let seenContentType: string | null = null;
    let seenField: unknown = null;
    server.use(
      http.post(`${BASE}/upload`, async ({ request: req }) => {
        seenContentType = req.headers.get('content-type');
        seenField = ((await req.formData()) as unknown as ServerForm).get('avatar');
        return HttpResponse.json({ ok: true });
      }),
    );
    const form = new FormData();
    form.append('avatar', new Blob(['img'], { type: 'image/png' }), 'a.png');

    const result = await request<{ ok: boolean }>(BASE, '/upload', {
      method: 'POST',
      body: form,
      token: 't1',
    });

    expect(result).toEqual({ ok: true });
    expect(seenField).not.toBeNull();
    expect((seenField as unknown as File).name).toBe('a.png');
    expect(seenContentType).toMatch(/^multipart\/form-data; boundary=/);
  });

  it('omits Authorization and Content-Type when there is no token or body', async () => {
    let headers: Headers | undefined;
    server.use(
      http.get(`${BASE}/plain`, ({ request: req }) => {
        headers = req.headers;
        return HttpResponse.json({});
      }),
    );

    await request(BASE, '/plain');

    expect(headers?.get('authorization')).toBeNull();
    expect(headers?.get('content-type')).toBeNull();
    expect(headers?.get('accept')).toBe('application/json');
  });

  it('omits undefined query params', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${BASE}/list`, ({ request: req }) => {
        seenUrl = req.url;
        return HttpResponse.json([]);
      }),
    );

    await request(BASE, '/list', { query: { cursor: undefined, limit: 20 } });

    expect(seenUrl.endsWith('?limit=20')).toBe(true);
  });

  it('204 resolves to undefined', async () => {
    server.use(http.delete(`${BASE}/thing`, () => new HttpResponse(null, { status: 204 })));

    await expect(request(BASE, '/thing', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('maps API error body', async () => {
    server.use(
      http.post(`${BASE}/login`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_credentials', message: 'Credenciais inválidas' } },
          { status: 401 },
        ),
      ),
    );

    const error = await request(BASE, '/login', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: 'invalid_credentials',
      message: 'Credenciais inválidas',
    });
  });

  it('non-JSON error body', async () => {
    server.use(
      http.get(
        `${BASE}/bad`,
        () =>
          new HttpResponse('<html>Bad Gateway</html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );

    const error = await request(BASE, '/bad').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      code: 'unknown',
      message: 'Não foi possível concluir. Tente de novo.',
    });
  });

  it('network failure', async () => {
    server.use(http.get(`${BASE}/down`, () => HttpResponse.error()));

    await expect(request(BASE, '/down')).rejects.toBeInstanceOf(NetworkError);
  });

  it('caller abort rejects with NetworkError', async () => {
    server.use(http.get(`${BASE}/slow`, () => HttpResponse.json({})));
    const controller = new AbortController();
    controller.abort();

    await expect(request(BASE, '/slow', { signal: controller.signal })).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it('times out after 20 seconds with NetworkError', async () => {
    jest.useFakeTimers();
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    try {
      const outcome = request(BASE, '/hang').catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(19_999);
      expect(fetchSpy.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);

      await expect(outcome).resolves.toBeInstanceOf(NetworkError);
    } finally {
      fetchSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
