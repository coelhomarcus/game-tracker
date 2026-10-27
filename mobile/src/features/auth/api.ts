import { apiBaseUrl } from '@/lib/env';
import type { ApiClient } from '@/lib/http/apiClient';
import { request } from '@/lib/http/request';
import type { SessionTokens } from '@/lib/http/session';

/** Who may start or send a direct message to the user. */
export const DM_POLICIES = ['everyone', 'following', 'nobody'] as const;
export type DmPolicy = (typeof DM_POLICIES)[number];

export type User = {
  id: string;
  username: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  /** `following`: only people this user follows may message them. */
  dmPolicy: DmPolicy;
};

export function isDmPolicy(value: unknown): value is DmPolicy {
  return typeof value === 'string' && (DM_POLICIES as readonly string[]).includes(value);
}

/** The signed-in user from `/auth/me`, login or register. A server without the policy means everyone. */
export function parseUser(json: Record<string, unknown>): User {
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return {
    id: json.id as string,
    username: json.username as string,
    name: text(json.name),
    email: json.email as string,
    avatarUrl: text(json.avatarUrl),
    bannerUrl: text(json.bannerUrl),
    bio: text(json.bio),
    dmPolicy: isDmPolicy(json.dmPolicy) ? json.dmPolicy : 'everyone',
  };
}

export type RegisterInput = {
  username: string;
  name: string;
  email: string;
  password: string;
};

export type AuthResult = { user: User } & SessionTokens;

type RawAuthResult = { user: Record<string, unknown> } & SessionTokens;

function parseAuthResult({ user, ...tokens }: RawAuthResult): AuthResult {
  return { user: parseUser(user), ...tokens };
}

// The auth routes call `request` directly: they never send a Bearer token and
// a 401 from them must not trigger a token refresh.
export const authApi = {
  login: async (identifier: string, password: string): Promise<AuthResult> =>
    parseAuthResult(
      await request<RawAuthResult>(apiBaseUrl, '/auth/login', {
        method: 'POST',
        body: { identifier, password },
      }),
    ),

  register: async (input: RegisterInput): Promise<AuthResult> =>
    parseAuthResult(
      await request<RawAuthResult>(apiBaseUrl, '/auth/register', { method: 'POST', body: input }),
    ),

  refresh: (refreshToken: string): Promise<SessionTokens> =>
    request<SessionTokens>(apiBaseUrl, '/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    }),

  logout: (refreshToken: string): Promise<void> =>
    request<void>(apiBaseUrl, '/auth/logout', { method: 'POST', body: { refreshToken } }),

  me: async (client: ApiClient): Promise<User> =>
    parseUser(await client.get<Record<string, unknown>>('/auth/me')),
};
