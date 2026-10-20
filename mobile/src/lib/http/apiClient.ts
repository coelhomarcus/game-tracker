import { ApiError, UNKNOWN_ERROR_MESSAGE } from './errors';
import { request, type RequestOptions } from './request';
import type { SessionManager } from './session';

export type ClientOptions = Omit<RequestOptions, 'method' | 'body' | 'token'>;

export type ApiClient = {
  get<T>(path: string, opts?: ClientOptions): Promise<T>;
  delete<T>(path: string, opts?: ClientOptions): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: ClientOptions): Promise<T>;
  put<T>(path: string, body?: unknown, opts?: ClientOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, opts?: ClientOptions): Promise<T>;
};

function cancelled(): ApiError {
  return new ApiError(0, 'cancelled', UNKNOWN_ERROR_MESSAGE);
}

export function createApiClient(session: SessionManager, baseUrl: string): ApiClient {
  async function send<T>(
    method: NonNullable<RequestOptions['method']>,
    path: string,
    body: unknown,
    opts: ClientOptions | undefined,
  ): Promise<T> {
    const generation = session.generation;

    // A response that belongs to an older session must not reach the caller,
    // nor trigger a refresh of the current session.
    const attempt = async (token: string | null): Promise<T> => {
      let result: T;
      try {
        result = await request<T>(baseUrl, path, { ...opts, method, body, token });
      } catch (error) {
        if (error instanceof ApiError && session.generation !== generation) throw cancelled();
        throw error;
      }
      if (session.generation !== generation) throw cancelled();
      return result;
    };

    const used = session.accessToken;
    try {
      return await attempt(used);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;

      const outcome = await session.refreshAfterUnauthorized(used);
      if (outcome === 'discarded') throw cancelled();
      if (outcome !== 'refreshed') throw error;
      if (session.generation !== generation) throw cancelled();
      if (session.accessToken === null) throw error;
      return attempt(session.accessToken);
    }
  }

  return {
    get: (path, opts) => send('GET', path, undefined, opts),
    delete: (path, opts) => send('DELETE', path, undefined, opts),
    post: (path, body, opts) => send('POST', path, body, opts),
    put: (path, body, opts) => send('PUT', path, body, opts),
    patch: (path, body, opts) => send('PATCH', path, body, opts),
  };
}
