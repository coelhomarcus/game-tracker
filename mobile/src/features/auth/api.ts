import { apiBaseUrl } from '@/lib/env';
import type { ApiClient } from '@/lib/http/apiClient';
import { request } from '@/lib/http/request';
import type { SessionTokens } from '@/lib/http/session';

export type User = {
  id: string;
  username: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
};

export type RegisterInput = {
  username: string;
  name: string;
  email: string;
  password: string;
};

export type AuthResult = { user: User } & SessionTokens;

// The auth routes call `request` directly: they never send a Bearer token and
// a 401 from them must not trigger a token refresh.
export const authApi = {
  login: (identifier: string, password: string): Promise<AuthResult> =>
    request<AuthResult>(apiBaseUrl, '/auth/login', {
      method: 'POST',
      body: { identifier, password },
    }),

  register: (input: RegisterInput): Promise<AuthResult> =>
    request<AuthResult>(apiBaseUrl, '/auth/register', { method: 'POST', body: input }),

  refresh: (refreshToken: string): Promise<SessionTokens> =>
    request<SessionTokens>(apiBaseUrl, '/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    }),

  logout: (refreshToken: string): Promise<void> =>
    request<void>(apiBaseUrl, '/auth/logout', { method: 'POST', body: { refreshToken } }),

  me: (client: ApiClient): Promise<User> => client.get<User>('/auth/me'),
};
