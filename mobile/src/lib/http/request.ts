import { ApiError, NetworkError, UNKNOWN_ERROR_MESSAGE } from './errors';

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  token?: string | null;
  signal?: AbortSignal;
};

const TIMEOUT_MS = 20_000;

function buildUrl(baseUrl: string, path: string, query: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.append(key, String(value));
  }
  const qs = params.toString();
  return `${baseUrl}${path}${qs ? `?${qs}` : ''}`;
}

function toApiError(status: number, raw: string): ApiError {
  try {
    const parsed: unknown = JSON.parse(raw);
    const error = (parsed as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    if (typeof error?.code === 'string' && typeof error.message === 'string') {
      return new ApiError(status, error.code, error.message);
    }
  } catch {
    // Not JSON (e.g. an HTML error page from a proxy); fall through.
  }
  return new ApiError(status, 'unknown', UNKNOWN_ERROR_MESSAGE);
}

export async function request<T>(
  baseUrl: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, query, token, signal } = opts;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  // The timeout and the caller's signal both feed one controller, so this
  // works on runtimes without AbortSignal.timeout / AbortSignal.any.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', forwardAbort);

  try {
    let response: Response;
    let raw: string;
    try {
      response = await fetch(buildUrl(baseUrl, path, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      raw = response.status === 204 ? '' : await response.text();
    } catch {
      throw new NetworkError();
    }

    if (!response.ok) throw toApiError(response.status, raw);
    if (raw === '') return undefined as T;

    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new ApiError(response.status, 'unknown', UNKNOWN_ERROR_MESSAGE);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
