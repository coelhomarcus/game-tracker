# Expo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new Expo client in `mobile/` with theme, base components, HTTP client with token refresh, authentication, the five-tab shell and validation CI.

**Architecture:** Expo Router screens in `mobile/app/` stay thin and compose code from `mobile/src/`. `src/lib/` holds infrastructure (env, storage, HTTP, session), `src/features/auth/` the auth API, store and forms, `src/components/` the design system, `src/theme/` the tokens. Session semantics mirror the Flutter `SessionManager`: one refresh in flight, a generation counter that discards results from a previous session, and a refresh outcome enum.

**Tech Stack:** Expo (latest SDK via `create-expo-app`), React Native, `react-native-web`, Expo Router, TypeScript strict, TanStack Query, Zustand, `expo-secure-store`, Jest (`jest-expo`), React Native Testing Library, MSW (Node), ESLint (`eslint-config-expo`).

**Spec:** `docs/superpowers/specs/2026-10-20-expo-migration-redesign-design.md` (sub-project 1, "Foundation").

## Global Constraints

- All work on `develop`. Conventional Commits with scope `mobile`, e.g. `feat(mobile): add session manager`.
- Commit messages, code, comments and docs must not name the products used as design references.
- Android `applicationId`/`package`: `com.marcuscoelho.gametracker`.
- API base URL from `EXPO_PUBLIC_API_URL`, without `/api`; the client appends `/api`. Defaults when unset: `http://10.0.2.2:3100` on Android, `http://localhost:3100` elsewhere.
- Dark theme only. Palette: `bg #16181c`, `surface #272c37`, `border #2a2d3c`, `active #3f4b64`, `text #cbd4dc`, `accent #ea377a`.
- Spacing 4, 8, 12, 16, 24, 32. Radii: `cover 6`, `card 12`, `control 12`. Font sizes 12, 14, 16, 20, 24. Font scaling stays enabled.
- Accent-filled buttons use bold text of at least 16.
- User-facing copy is Brazilian Portuguese, exactly as written in this plan.
- The Flutter client in `frontend/` is not touched by this plan.
- Install Expo-managed packages with `npx expo install <pkg>` so versions match the SDK; others with `npm i`.

## Review Focus

1. Several requests get 401 at the same time: exactly one `/auth/refresh` call happens and all requests retry with the new token (test in Task 5).
2. The user signs out while a refresh is in flight: the late refresh result is discarded and the old account is not restored (test in Task 5).
3. The app starts offline with a saved refresh token: the token is kept and the "Não foi possível conectar" screen offers retry and sign out, instead of logging the user out (test in Task 6).
4. Storage is unavailable on web (private mode, `localStorage` throws): the app still boots to the login screen and login works for the session (test in Task 3).
5. The API answers with a non-JSON body (proxy 502 HTML page): the client raises `ApiError` with a generic message instead of crashing on `JSON.parse` (test in Task 4).

---

### Task 1: Scaffold the Expo app and quality tooling

**Files:**
- Create: `mobile/` (via `create-expo-app`), `mobile/app.json`, `mobile/tsconfig.json`, `mobile/jest.config.js`, `mobile/jest.setup.ts`, `mobile/eslint.config.js`, `mobile/README.md`, `mobile/.gitignore`
- Test: `mobile/src/__tests__/smoke.test.tsx`

**Interfaces:**
- Produces: npm scripts `typecheck` (`tsc --noEmit`), `lint` (`expo lint`), `test` (`jest`), `web` (`expo start --web`), `android` (`expo start --android`); path alias `@/*` → `src/*`.

- [ ] **Step 1: Create the project**

Run from the repo root: `npx create-expo-app@latest mobile --template default` then remove the template's example screens, components, hooks and constants so `app/` contains only `_layout.tsx` and `index.tsx`.

- [ ] **Step 2: Configure `app.json`**

Set `name: "GameTracker"`, `slug: "gametracker"`, `scheme: "gametracker"`, `userInterfaceStyle: "dark"`, `android.package: "com.marcuscoelho.gametracker"`, `backgroundColor` and `android.adaptiveIcon.backgroundColor` to `#16181c`, `web.bundler: "metro"`, plugins `expo-router` and `expo-secure-store`.

- [ ] **Step 3: Configure TypeScript, Jest and ESLint**

`tsconfig.json`: `strict: true`, `paths: { "@/*": ["src/*"] }`. Install `jest-expo`, `jest`, `@testing-library/react-native`, `@types/jest`, `msw`; `jest.config.js` uses preset `jest-expo`, `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']`, `moduleNameMapper` for `@/`. Run `npx expo lint` once to generate `eslint.config.js`. Add the scripts listed in Interfaces.

- [ ] **Step 4: Write the smoke test**

```tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

test('test environment renders React Native components', () => {
  render(<Text>GameTracker</Text>);
  expect(screen.getByText('GameTracker')).toBeOnTheScreen();
});
```

- [ ] **Step 5: Run all checks**

Run in `mobile/`: `npm run typecheck && npm run lint && npm test`
Expected: all three exit 0; Jest reports 1 passed.

- [ ] **Step 6: Write `mobile/README.md`**

Sections: requirements (Node 22+), `npm ci`, `EXPO_PUBLIC_API_URL=https://gt.marcuscoelho.com npm run web` for the browser preview, `npm run android` for the emulator (default API `http://10.0.2.2:3100`), and the three check commands.

- [ ] **Step 7: Commit**

```bash
git add mobile
git commit -m "build(mobile): scaffold Expo app with TypeScript, Jest and ESLint"
```

---

### Task 2: Theme tokens

**Files:**
- Create: `mobile/src/theme/tokens.ts`, `mobile/src/theme/contrast.ts`
- Test: `mobile/src/theme/__tests__/tokens.test.ts`

**Interfaces:**
- Produces: `colors` (`bg`, `surface`, `border`, `active`, `text`, `textMuted`, `textStrong`, `accent`, `onAccent`, `danger`, `status: Record<GameStatus, string>`), `space` (`xs 4, sm 8, md 12, lg 16, xl 24, xxl 32`), `radii` (`cover 6, card 12, control 12`), `fontSize` (`xs 12, sm 14, md 16, lg 20, xl 24`), `type GameStatus = 'playing' | 'completed' | 'backlog' | 'dropped'`; `contrastRatio(fg: string, bg: string): number` (WCAG relative luminance, hex `#rrggbb`).

- [ ] **Step 1: Write the failing tests**

```ts
import { colors } from '../tokens';
import { contrastRatio } from '../contrast';

test('palette values match the spec', () => {
  expect(colors).toMatchObject({
    bg: '#16181c', surface: '#272c37', border: '#2a2d3c',
    active: '#3f4b64', text: '#cbd4dc', accent: '#ea377a',
  });
});

test('contrastRatio follows WCAG', () => {
  expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
});

test.each(['text', 'textMuted', 'textStrong', 'danger'] as const)(
  '%s reads at 4.5:1 on bg and surface', (key) => {
    expect(contrastRatio(colors[key], colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors[key], colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

test.each(['playing', 'completed', 'backlog', 'dropped'] as const)(
  'status %s reads at 4.5:1 on bg and surface', (s) => {
    expect(contrastRatio(colors.status[s], colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.status[s], colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

test('accent buttons reach the large-text minimum', () => {
  expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/theme` — Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `tokens.ts` and `contrast.ts`**

Starting values for derived colors: `textMuted #9aa5b1`, `textStrong #f2f5f7`, `onAccent #ffffff`, `danger #ff7a7a`, status `playing #5cb8ff`, `completed #4ad497`, `backlog #a6abbb`, `dropped #ff8e80`. If a contrast test fails, raise that color's lightness keeping its hue until it passes; do not change the six spec palette values.

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/theme` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/theme
git commit -m "feat(mobile): add dark theme tokens with contrast checks"
```

---

### Task 3: Environment and token storage

**Files:**
- Create: `mobile/src/lib/env.ts`, `mobile/src/lib/tokenStore.ts`
- Test: `mobile/src/lib/__tests__/env.test.ts`, `mobile/src/lib/__tests__/tokenStore.test.ts`

**Interfaces:**
- Produces: `resolveApiBaseUrl(raw: string | undefined, platform: 'android' | 'ios' | 'web'): string` (returns base URL ending in `/api`) and `apiBaseUrl: string` (computed from `process.env.EXPO_PUBLIC_API_URL` and `Platform.OS`); `interface TokenStore { read(): Promise<string | null>; write(token: string): Promise<void>; clear(): Promise<void> }`; `createTokenStore(platform: string): TokenStore`; `tokenStore: TokenStore`. Storage key: `gametracker.refreshToken`.

- [ ] **Step 1: Write the failing tests**

`env.test.ts`:
```ts
import { resolveApiBaseUrl as r } from '../env';

test('appends /api to the configured URL', () => {
  expect(r('https://gt.marcuscoelho.com', 'android')).toBe('https://gt.marcuscoelho.com/api');
});
test('tolerates a trailing slash or an /api suffix', () => {
  expect(r('https://gt.marcuscoelho.com/', 'web')).toBe('https://gt.marcuscoelho.com/api');
  expect(r('https://gt.marcuscoelho.com/api', 'web')).toBe('https://gt.marcuscoelho.com/api');
});
test('defaults per platform when unset or blank', () => {
  expect(r(undefined, 'android')).toBe('http://10.0.2.2:3100/api');
  expect(r('  ', 'web')).toBe('http://localhost:3100/api');
});
```

`tokenStore.test.ts` (web branch; mock `expo-secure-store` for the native branch):
```ts
import { createTokenStore } from '../tokenStore';

test('web: round-trips through localStorage', async () => {
  const store = createTokenStore('web');
  await store.write('a.b');
  expect(await store.read()).toBe('a.b');
  await store.clear();
  expect(await store.read()).toBeNull();
});

test('web: storage that throws behaves as empty and never rejects', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  const store = createTokenStore('web');
  await expect(store.write('a.b')).resolves.toBeUndefined();
  await expect(store.read()).resolves.toBeNull();
});

test('native: uses SecureStore with the fixed key', async () => {
  const SecureStore = require('expo-secure-store');
  const store = createTokenStore('android');
  await store.write('x.y');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('gametracker.refreshToken', 'x.y');
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib` → FAIL, modules not found.

- [ ] **Step 3: Implement `env.ts` and `tokenStore.ts`**

`npx expo install expo-secure-store`. Web branch wraps every `localStorage` call in try/catch; a failed read returns `null`, a failed write/clear resolves silently.

- [ ] **Step 4: Run to verify pass** — `npx jest src/lib` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): add API URL resolution and refresh token storage"
```

---

### Task 4: HTTP client and API errors

**Files:**
- Create: `mobile/src/lib/http/errors.ts`, `mobile/src/lib/http/request.ts`
- Test: `mobile/src/lib/http/__tests__/request.test.ts` (starts with `/** @jest-environment node */`, uses `msw/node`)

**Interfaces:**
- Produces:
  - `class ApiError extends Error { status: number; code: string }` — built from `{ error: { code, message } }`; non-JSON or missing body → `code: 'unknown'`, `message: 'Não foi possível concluir. Tente de novo.'`.
  - `class NetworkError extends Error` — fetch rejected or timed out.
  - `type RequestOptions = { method?: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'; body?: unknown; query?: Record<string, string | number | undefined>; token?: string | null; signal?: AbortSignal }`
  - `request<T>(baseUrl: string, path: string, opts?: RequestOptions): Promise<T>` — JSON in/out, `Accept: application/json`, `Authorization: Bearer <token>` when `token` is set, 204 → `undefined`, timeout 20 s.

- [ ] **Step 1: Write the failing tests**

Against `http://test/api` with MSW handlers:
- `sends JSON and Bearer, parses JSON` — handler asserts `authorization === 'Bearer t1'` and body `{ a: 1 }`; `request` resolves to the handler's JSON.
- `omits undefined query params` — `query: { cursor: undefined, limit: 20 }` → URL ends with `?limit=20`.
- `204 resolves to undefined`.
- `maps API error body` — 401 `{ error: { code: 'invalid_credentials', message: 'Credenciais inválidas' } }` → rejects with `ApiError` where `status === 401`, `code === 'invalid_credentials'`, `message === 'Credenciais inválidas'`.
- `non-JSON error body` — 502 with `<html>Bad Gateway</html>` → `ApiError` with `status 502`, `code 'unknown'`, message `'Não foi possível concluir. Tente de novo.'`.
- `network failure` — `HttpResponse.error()` → rejects with `NetworkError`.

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/http` → FAIL.

- [ ] **Step 3: Implement `errors.ts` and `request.ts`**

Timeout with `AbortSignal.timeout(20_000)` combined with the caller's `signal` (`AbortSignal.any` when available, otherwise the caller's signal wins).

- [ ] **Step 4: Run to verify pass** — `npx jest src/lib/http` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/http
git commit -m "feat(mobile): add JSON HTTP client with typed API errors"
```

---

### Task 5: Session manager and authenticated client

**Files:**
- Create: `mobile/src/lib/http/session.ts`, `mobile/src/lib/http/apiClient.ts`
- Test: `mobile/src/lib/http/__tests__/session.test.ts`, `mobile/src/lib/http/__tests__/apiClient.test.ts` (node environment, MSW)

**Interfaces:**
- Consumes: `TokenStore` (Task 3), `request`, `ApiError`, `NetworkError` (Task 4).
- Produces:
  - `type SessionTokens = { accessToken: string; refreshToken: string }`
  - `type RefreshOutcome = 'refreshed' | 'invalid' | 'unavailable' | 'discarded' | 'noSession'`
  - `class SessionManager { constructor(store: TokenStore, refreshCall: (refreshToken: string) => Promise<SessionTokens>); accessToken: string | null; generation: number; onExpired?: () => void; start(t: SessionTokens): Promise<void>; restore(): Promise<RefreshOutcome>; refreshAfterUnauthorized(usedToken: string | null): Promise<RefreshOutcome>; clear(): Promise<string | null> }`
  - `createApiClient(session: SessionManager, baseUrl: string): { get<T>(path, opts?), post<T>(path, body?, opts?), put<T>(...), patch<T>(...), delete<T>(path, opts?) }`

Semantics (same as the Flutter client):
- `start` increments `generation`, sets the access token, writes the refresh token.
- One refresh in flight; concurrent callers await the same promise.
- `refreshAfterUnauthorized(used)`: if the current access token differs from `used`, return `'refreshed'` without calling the server.
- Refresh result after `generation` changed → `'discarded'`, nothing applied.
- `ApiError` with status 401 or 400 → `clear()`, call `onExpired`, return `'invalid'`. Other `ApiError` or `NetworkError` → `'unavailable'`, token kept. No stored token → `'noSession'`.
- `clear` increments `generation`, drops the access token, clears the store and returns the previous refresh token.
- `apiClient`: on 401 call `refreshAfterUnauthorized` once; on `'refreshed'` retry once with the new token; otherwise rethrow the original `ApiError`. A response that arrives after `generation` changed rejects with `ApiError` `code: 'cancelled'`.

- [ ] **Step 1: Write the failing tests**

`session.test.ts` with an in-memory `TokenStore` and a jest-mock `refreshCall`:
- `start stores tokens and bumps generation`.
- `concurrent refreshes share one call` — three `refreshAfterUnauthorized(null)` in parallel → `refreshCall` called once, all resolve `'refreshed'`.
- `skips the server when another request already refreshed` — after a refresh to `a2`, `refreshAfterUnauthorized('a1')` → `'refreshed'`, `refreshCall` not called again.
- `discards a refresh that finishes after clear` — `refreshCall` returns a deferred promise; call `restore()`, then `clear()`, then resolve → outcome `'discarded'`, `accessToken === null`, store empty.
- `invalid refresh token ends the session` — `refreshCall` rejects `ApiError(401)` → `'invalid'`, store cleared, `onExpired` called once.
- `network failure keeps the session` — rejects `NetworkError` → `'unavailable'`, store still holds the token, `onExpired` not called.
- `no stored token` → `'noSession'`.

`apiClient.test.ts` with MSW:
- `retries once after a successful refresh` — first `GET /api/feed` → 401, `/api/auth/refresh` → new tokens, second `GET` with the new Bearer → 200; resolves with the body.
- `parallel 401s refresh once` — three parallel GETs all 401 first → exactly one `/api/auth/refresh` request (count in the handler), all three resolve.
- `does not loop` — `GET` keeps returning 401 after refresh → rejects with `ApiError` status 401; refresh called once.

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/http` → FAIL.

- [ ] **Step 3: Implement `session.ts` and `apiClient.ts`**

- [ ] **Step 4: Run to verify pass** — `npx jest src/lib/http` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/http
git commit -m "feat(mobile): add session manager with single-flight token refresh"
```

---

### Task 6: Auth API and session store

**Files:**
- Create: `mobile/src/features/auth/api.ts`, `mobile/src/features/auth/session.ts`, `mobile/src/features/auth/messages.ts`, `mobile/src/features/auth/index.ts`, `mobile/src/lib/queryClient.ts`
- Test: `mobile/src/features/auth/__tests__/session.test.ts`, `mobile/src/features/auth/__tests__/messages.test.ts`

**Interfaces:**
- Consumes: `SessionManager`, `createApiClient`, `request`, errors (Tasks 4–5); `tokenStore`, `apiBaseUrl` (Task 3).
- Produces:
  - `type User = { id: string; username: string; name: string | null; email: string; avatarUrl: string | null; bannerUrl: string | null; bio: string | null }`
  - `authApi`: `login(identifier, password)`, `register({ username, name, email, password })` → `Promise<{ user: User } & SessionTokens>`; `refresh(refreshToken)` → `Promise<SessionTokens>`; `logout(refreshToken)` → `Promise<void>`; `me(client)` → `Promise<User>`. Routes: `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`. Auth routes never send a Bearer and never trigger refresh.
  - `useSession` (Zustand): `{ status: 'restoring' | 'signedOut' | 'signedIn' | 'unreachable'; user: User | null; bootstrap(): Promise<void>; signIn(identifier, password): Promise<void>; signUp(input): Promise<void>; signOut(): Promise<void> }`
  - `api` — the shared authenticated client (`createApiClient(sessionManager, apiBaseUrl)`), exported from `features/auth/index.ts` for later features.
  - `authErrorMessage(error: unknown): string`
  - `queryClient` (TanStack `QueryClient`); `signOut` calls `queryClient.clear()`.

Behavior:
- `bootstrap`: `restore()` → `'refreshed'` then `me()` → `signedIn`; `'noSession'` or `'invalid'` → `signedOut`; `'unavailable'` → `unreachable` (token kept).
- `signOut`: `clear()` locally first, then best-effort `logout(previousToken)` ignoring errors; status `signedOut`, `user null`.
- `onExpired` → status `signedOut`.

`authErrorMessage` copy (exact):
- `NetworkError` → `Sem conexão com o servidor. Verifique a internet e tente de novo.`
- `ApiError` code `invalid_credentials` → `E-mail, username ou senha incorretos.`
- `ApiError` status 409 → `Username ou e-mail já cadastrado.`
- `ApiError` status 429 or ≥ 500 → the error's own message
- `ApiError` status 400 → `Dados inválidos. Revise os campos.`
- anything else → `Não foi possível concluir. Tente de novo.`

- [ ] **Step 1: Write the failing tests**

`messages.test.ts`: one `test.each` row per mapping above, asserting the exact string.

`session.test.ts` (mock `authApi` and the `SessionManager` instance via `jest.mock`):
- `bootstrap with a valid token signs in` → `status 'signedIn'`, `user.username === 'ana'`.
- `bootstrap without a token signs out` → `'signedOut'`.
- `bootstrap offline keeps the token` → restore resolves `'unavailable'` → `status 'unreachable'`, `clear` not called.
- `signIn starts the session` → `SessionManager.start` called with the returned tokens, `status 'signedIn'`.
- `signOut clears locally even if the server call fails` → `logout` rejects with `NetworkError`; `clear` called, `status 'signedOut'`, `queryClient.clear` called.

- [ ] **Step 2: Run to verify failure** — `npx jest src/features/auth` → FAIL.

- [ ] **Step 3: Implement** — `npm i zustand @tanstack/react-query`.

- [ ] **Step 4: Run to verify pass** — `npx jest src/features/auth` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/auth mobile/src/lib/queryClient.ts mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): add auth API, session store and error messages"
```

---

### Task 7: Base components

**Files:**
- Create: `mobile/src/components/Button.tsx`, `TextField.tsx`, `Pill.tsx`, `Avatar.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `Tabs.tsx`, `Screen.tsx`, `index.ts` (all under `mobile/src/components/`)
- Test: `mobile/src/components/__tests__/components.test.tsx`

**Interfaces:**
- Consumes: tokens (Task 2).
- Produces:
  - `Button({ label, onPress, variant?: 'primary' | 'secondary' | 'text', loading?: boolean, disabled?: boolean })` — primary uses `accent` background, `onAccent` bold text size 16; min height 48; `accessibilityRole="button"`; while `loading` shows a spinner, is disabled, and keeps `label` as accessibility label.
  - `TextField({ label, value, onChangeText, error?: string, secureTextEntry?, autoComplete?, keyboardType?, autoCapitalize? })` — visible label, `error` rendered below in `danger` and exposed via accessibility.
  - `Pill({ children, tone?: 'default' | 'accent' })`
  - `Avatar({ uri?: string | null, name: string, size?: number })` — fallback shows the first letter of `name`.
  - `EmptyState({ title, message?, action?: { label, onPress } })`
  - `Skeleton({ width?, height, radius? })`
  - `Tabs<T extends string>({ items: { value: T; label: string }[], selected: T, onSelect(value: T) })` — horizontally scrollable, selected item uses `active` background, each item `accessibilityRole="tab"` with `accessibilityState.selected`.
  - `Screen({ children, scroll?: boolean })` — `bg` background, safe area.

Covers, the cover grid, the cover footer and the status icon belong to sub-project 2 and are not built here.

- [ ] **Step 1: Write the failing tests**

- `Button calls onPress` and `Button loading is disabled and keeps its label` (`getByRole('button', { name: 'Entrar' })` is disabled, `onPress` not called on press).
- `TextField shows its error` — `getByText('Use pelo menos 8 caracteres')`.
- `Avatar falls back to the initial` — `name="ana"` without `uri` → `getByText('A')`.
- `Tabs marks the selected tab and reports selection` — `getByRole('tab', { name: 'Seguindo', selected: true })`; pressing `Para você` calls `onSelect('general')`.
- `EmptyState renders action` — pressing the action label calls its handler.

- [ ] **Step 2: Run to verify failure** — `npx jest src/components` → FAIL.

- [ ] **Step 3: Implement the components** — `npx expo install react-native-safe-area-context` if not already present.

- [ ] **Step 4: Run to verify pass** — `npx jest src/components` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components
git commit -m "feat(mobile): add base design system components"
```

---

### Task 8: Login and register screens

**Files:**
- Create: `mobile/src/features/auth/validation.ts`, `mobile/src/features/auth/LoginForm.tsx`, `mobile/src/features/auth/RegisterForm.tsx`, `mobile/app/(auth)/_layout.tsx`, `mobile/app/(auth)/login.tsx`, `mobile/app/(auth)/register.tsx`
- Test: `mobile/src/features/auth/__tests__/validation.test.ts`, `mobile/src/features/auth/__tests__/forms.test.tsx`

**Interfaces:**
- Consumes: `useSession`, `authErrorMessage` (Task 6); `Button`, `TextField`, `Screen` (Task 7).
- Produces: `validateLogin({ identifier, password }): Partial<Record<'identifier' | 'password', string>>`, `validateRegister({ name, username, email, password }): Partial<Record<'name' | 'username' | 'email' | 'password', string>>`; `LoginForm`, `RegisterForm` components.

Copy (exact):
- Login fields: `E-mail ou username`, `Senha`; button `Entrar`; link `Criar conta`.
- Register fields: `Nome`, `Username`, `E-mail`, `Senha`; button `Criar conta`; link `Já tenho conta`.
- Required field: `Campo obrigatório`. Username: shorter than 3 → `Use pelo menos 3 caracteres`; outside `^[a-zA-Z0-9_]+$` → `Use apenas letras, números e _`; longer than 30 → `Use no máximo 30 caracteres`. E-mail invalid → `Informe um e-mail válido`. Password: shorter than 8 → `Use pelo menos 8 caracteres`; longer than 72 → `Use no máximo 72 caracteres`. Name longer than 50 → `Use no máximo 50 caracteres`.
- Server errors shown above the button with `authErrorMessage`.

- [ ] **Step 1: Write the failing tests**

`validation.test.ts`: one assertion per rule above with its exact message, plus `valid input returns {}` for each form.

`forms.test.tsx` (mock `useSession`):
- `login submits trimmed identifier` — type `  ana  ` and `secret`, press `Entrar` → `signIn('ana', 'secret')`.
- `login shows field errors without calling the server` — press `Entrar` empty → two `Campo obrigatório`, `signIn` not called.
- `login shows the server message` — `signIn` rejects `ApiError(401, 'invalid_credentials')` → `getByText('E-mail, username ou senha incorretos.')`.
- `button is disabled while submitting` — pending `signIn` → `Entrar` button disabled.
- `register submits all fields` → `signUp({ username: 'ana_1', name: 'Ana', email: 'ana@x.com', password: 'longpassword' })`.

- [ ] **Step 2: Run to verify failure** — `npx jest src/features/auth` → FAIL.

- [ ] **Step 3: Implement validation, forms and the two route files**

Route files render the forms inside `Screen`; links navigate with `router.replace('/register')` / `router.replace('/login')`.

- [ ] **Step 4: Run to verify pass** — `npx jest src/features/auth` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/auth mobile/app/'(auth)'
git commit -m "feat(mobile): add login and register screens"
```

---

### Task 9: App shell, session gate and tabs

**Files:**
- Create/modify: `mobile/app/_layout.tsx`, `mobile/app/index.tsx`, `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/index.tsx`, `library.tsx`, `explore.tsx`, `messages.tsx`, `profile.tsx`, `mobile/app/notifications.tsx`, `mobile/src/features/auth/SessionGate.tsx`, `mobile/src/components/HeaderBell.tsx`
- Test: `mobile/src/__tests__/shell.test.tsx` (uses `renderRouter` from `expo-router/testing-library`)

**Interfaces:**
- Consumes: `useSession`, `queryClient` (Task 6); components (Task 7); auth routes (Task 8).
- Produces: route names `/(tabs)` (`index`, `library`, `explore`, `messages`, `profile`), `/login`, `/register`, `/notifications`. Later sub-projects replace the placeholder tab screens.

Behavior and copy (exact):
- Root layout: `QueryClientProvider`, `SafeAreaProvider`, dark status bar, `bg` background; calls `bootstrap()` once on mount.
- `restoring` → full-screen spinner with accessibility label `Carregando`.
- `unreachable` → `EmptyState` title `Não foi possível conectar`, message `Sua sessão está guardada. Verifique a conexão e tente de novo.`, buttons `Tentar novamente` (calls `bootstrap`) and `Sair da conta` (calls `signOut`).
- `signedOut` → only `(auth)` routes; any other route redirects to `/login`. `signedIn` → `(auth)` routes redirect to `/`.
- Tabs, in order, with labels: `Início`, `Biblioteca`, `Explorar`, `Mensagens`, `Perfil`. Tab bar uses `surface` background, `border` top border, `accent` active tint, `textMuted` inactive tint.
- Each placeholder tab shows `EmptyState` with its tab label as title and message `Em construção`.
- `Início`, `Biblioteca`, `Explorar` and `Perfil` headers show `HeaderBell` (accessibility label `Notificações`) that pushes `/notifications` (placeholder with the same `EmptyState` pattern, title `Notificações`).
- The `Perfil` placeholder also shows a `Sair da conta` button (calls `signOut`) so the flow can be exercised end to end.

- [ ] **Step 1: Write the failing tests**

With `useSession` mocked per test:
- `signed out lands on login` — `status 'signedOut'`, initial URL `/library` → `getByText('E-mail ou username')`.
- `signed in shows the five tabs in order` — the tab bar buttons' accessible names (query by role `tab`; if the installed tab bar exposes role `button`, query that role inside the tab bar) equal `['Início', 'Biblioteca', 'Explorar', 'Mensagens', 'Perfil']`.
- `signed in cannot open login` — initial URL `/login` → `getByRole('tab', { name: 'Início', selected: true })`.
- `unreachable offers retry and sign out` — pressing `Tentar novamente` calls `bootstrap`; pressing `Sair da conta` calls `signOut`.
- `bell opens notifications` — press `Notificações` → `getByText('Notificações')` heading on the notifications screen.

- [ ] **Step 2: Run to verify failure** — `npx jest src/__tests__/shell.test.tsx` → FAIL.

- [ ] **Step 3: Implement the layouts, gate, tabs and placeholders** — `npx expo install @expo/vector-icons` if not already present; tab icons from Ionicons (`home`, `library`, `search`, `chatbubbles`, `person`).

- [ ] **Step 4: Run all checks** — in `mobile/`: `npm run typecheck && npm run lint && npm test` → all exit 0.

- [ ] **Step 5: Verify in the browser against production**

Run: `EXPO_PUBLIC_API_URL=https://gt.marcuscoelho.com npx expo start --web --port 8081`. In a 390 px wide viewport: login with a real account reaches `Início`; the five tabs switch; the bell opens `Notificações`; reloading the page keeps the session (on web the refresh token is in `localStorage`); `Sair da conta` returns to login. If login fails with a CORS error, record it in the task report: the backend's allowed origins are outside this plan's scope.

- [ ] **Step 6: Commit**

```bash
git add mobile/app mobile/src
git commit -m "feat(mobile): add session gate and five-tab shell"
```

---

### Task 10: Validation CI

**Files:**
- Create: `.github/workflows/mobile.yml`

**Interfaces:**
- Consumes: npm scripts from Task 1.

- [ ] **Step 1: Write the workflow**

Name `Mobile`. Triggers: `push` to `main` and `pull_request`, both with `paths: ['mobile/**', '.github/workflows/mobile.yml']`. `concurrency: { group: mobile-${{ github.ref }}, cancel-in-progress: true }`. `defaults.run.working-directory: mobile`. One job `check` on `ubuntu-latest`: `actions/checkout@v4`; `actions/setup-node@v4` with `node-version: '22'`, `cache: npm`, `cache-dependency-path: mobile/package-lock.json`; then `npm ci`, `npm run typecheck`, `npm run lint`, `npm test -- --ci`.

- [ ] **Step 2: Validate locally**

Run in `mobile/`: `npm ci && npm run typecheck && npm run lint && npm test -- --ci` → all exit 0. Run from the repo root: `npx --yes @action-validator/cli .github/workflows/mobile.yml` → exits 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/mobile.yml
git commit -m "ci: validate the mobile app on pull requests"
```
