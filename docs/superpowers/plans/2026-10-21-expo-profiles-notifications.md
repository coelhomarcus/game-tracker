# Expo Profiles and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add profiles (own and others), follow, editing the profile with avatar and banner upload, people search in Explore, the notifications center with an unread badge, settings, and make authors and players open their profiles.

**Architecture:** Same layering as before: `src/features/profiles/` and `src/features/notifications/` with typed `api.ts`, TanStack Query hooks and components; thin routes. Follow state is optimistic and rolled back per user, like post likes. The own profile is the Perfil tab; other people are `/users/[id]` (opening yourself redirects to the Perfil tab).

**Tech Stack:** Expo SDK 58, Expo Router, TypeScript strict, TanStack Query v5, `expo-image-picker`, `expo-constants`, Jest + RNTL 14, MSW.

**Spec:** `docs/superpowers/specs/2026-10-20-expo-migration-redesign-design.md` (sub-project 3 "Social", second half: profiles, follow, notifications). Chat ("Mensagem" button) and push notifications are sub-project 4 and out of scope.

## Global Constraints

- All work on `develop`. Conventional Commits with scope `mobile`. Commit messages, code, comments and docs never name the products used as design references.
- Routes live in `mobile/src/app/`; alias `@/*` → `mobile/src/*`; new route groups are registered once in `SessionGate`'s signed-in `Stack.Protected`. RNTL 14 is async. Single-quote style.
- Theme tokens only; dark only; `textMuted` never on `active`; interactive targets ≥ 48 dp.
- User-facing copy is Brazilian Portuguese, exactly as written in this plan. Display name = `name` when non-blank, else `username`.
- Backend unchanged. Routes: `GET /users/:id` → `{ id, username, name, avatarUrl, bannerUrl, bio, createdAt, followerCount, followingCount, gameEntryCount, isFollowedByMe }`; `GET /users/search?q=` (1–50 chars) → `[{ id, username, name, avatarUrl, bio, isFollowedByMe }]`; `GET /users/:id/posts?type=activity|post&cursor=&limit=` → `{ items, nextCursor }`; `GET /users/:id/game-entries` → entries (same shape as `/game-entries/me`); `GET /users/:id/favorites` → games; `POST|DELETE /users/:id/follow` → 204; `PATCH /users/me` body `{ username?, name? (1–50), bio? (≤ 280) }` → user (409 `conflict` when the username is taken); `POST /users/me/avatar` multipart field `avatar` and `POST /users/me/banner` field `banner` (image/*, ≤ 8 MB) → `{ avatarUrl }` / `{ bannerUrl }` (read the controller for the exact key); `GET /notifications` → `{ items: [{ id, type: 'like'|'comment'|'follow', actor, postId, read, createdAt }], unreadCount }` (latest 50); `POST /notifications/read-all` → 204.
- Image URLs (`avatarUrl`, `bannerUrl`) always go through `resolveImageUrl`.
- The Flutter client in `frontend/lib/features/profiles/` and `frontend/lib/features/notifications/` is the behavioral reference; `frontend/` and `backend/` are not modified.

## Review Focus

1. Following someone from search, then opening their profile, shows the same state and follower count; a failed follow rolls back only that person and shows a toast (test in Task 2).
2. Picking an image over 8 MB is refused before uploading with `A imagem passa de 8 MB. Escolha uma menor.`; a failed upload keeps the old picture and shows the error (test in Task 5).
3. Saving the profile with a username already in use shows `Esse username já está em uso` on the field and keeps the form; saving with no changes sends nothing (test in Task 5).
4. Opening your own id at `/users/<myId>` lands on the Perfil tab instead of a second copy of your profile (test in Task 4).
5. The unread badge updates after "Marcar todas como lidas" without waiting for the next poll, and polling stops while signed out (test in Task 7).

---

### Task 1: Profile and notification API (with multipart upload)

**Files:**
- Create: `mobile/src/features/profiles/types.ts`, `mobile/src/features/profiles/api.ts`, `mobile/src/features/notifications/types.ts`, `mobile/src/features/notifications/api.ts`
- Modify: `mobile/src/lib/http/request.ts` (accept a `FormData` body), `mobile/src/lib/http/apiClient.ts` if needed
- Test: `mobile/src/features/profiles/__tests__/api.test.ts`, `mobile/src/features/notifications/__tests__/api.test.ts`, `mobile/src/lib/http/__tests__/request.test.ts` (extend)

**Interfaces:**
- Produces:
  - `request`: when `body instanceof FormData`, send it as-is and do not set `Content-Type` (the runtime adds the multipart boundary); JSON behavior unchanged.
  - `UserProfile { id; username; name: string | null; avatarUrl: string | null; bannerUrl: string | null; bio: string | null; createdAt: Date; followerCount; followingCount; entryCount; isFollowedByMe }` (from `gameEntryCount`; missing counts → 0).
  - `PersonResult { id; username; name; avatarUrl; bio; isFollowedByMe }`.
  - `ImageKind = 'avatar' | 'banner'`; `PickedImage = { uri: string; mimeType: string; fileName: string; size: number | null }`.
  - `profilesApi.get(id)`, `search(term)`, `posts(id, type: 'activity' | 'post', cursor?)` → `PostPage` (reuse the feed parser), `entries(id)` → `GameEntry[]` (reuse `parseEntry`), `favorites(id)` → `Game[]`, `setFollow(id, follow)`, `update(changes: { username?; name?; bio? })` → `UserProfile`-compatible user, `upload(kind, image: PickedImage)` → `string` (the new URL). On web, `upload` appends a `Blob` fetched from `image.uri`; on native, appends `{ uri, name: fileName, type: mimeType }`.
  - `AppNotification { id; type: 'like' | 'comment' | 'follow'; actor: UserSummary; postId: string | null; read: boolean; createdAt: Date }` (unknown type → item skipped); `NotificationsData { items; unreadCount }`; `notificationsApi.list()`, `markAllRead()`.

- [ ] **Step 1: Write the failing tests** — parsing (counts default, `gameEntryCount` → `entryCount`, unknown notification type skipped); `search` encodes `q`; `posts` sends `type`, `limit=20`, `cursor` only when given; `setFollow` POST/DELETE; `update` sends only the given keys; `request` with `FormData` omits `Content-Type` and sends the form (MSW handler reads `request.formData()` and sees the `avatar` field); `upload('banner', …)` hits `/users/me/banner` with field `banner` and returns the URL.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add profile and notification API clients with image upload"`

---

### Task 2: Profile, follow and notification queries

**Files:**
- Create: `mobile/src/features/profiles/queries.ts`, `mobile/src/features/notifications/queries.ts`
- Test: `mobile/src/features/profiles/__tests__/queries.test.tsx`, `mobile/src/features/notifications/__tests__/queries.test.tsx`

**Interfaces:**
- Consumes: Task 1; `useSession` (`user`, `status`), `showToast`, `authErrorMessage`.
- Produces:
  - Keys: `['profile', id]`, `['people', term]`, `['userPosts', id, type]`, `['userEntries', id]`, `['userFavorites', id]`, `['notifications']`.
  - `useProfile(id?)`, `usePeopleSearch(term)` (300 ms debounce via `useDebouncedValue`, disabled under 2 trimmed characters, `keepPreviousData`), `useUserPosts(id?, type)` (infinite), `useUserEntries(id?)`, `useUserFavorites(id?)`.
  - `useToggleFollow()` → `mutate({ id, follow })`: optimistic update of `['profile', id]` (`isFollowedByMe`, `followerCount ± 1`) and every cached `['people', *]` result with that id; rollback of only that user on error with `showToast(authErrorMessage(error))`; on success invalidate `['feed', 'following']`.
  - `useUpdateProfile()` → `mutateAsync(changes)`; on success writes the result into `['profile', me]` and updates `useSession`'s `user` (name, username, bio).
  - `useUploadImage()` → `mutateAsync({ kind, image })`; on success sets `avatarUrl`/`bannerUrl` in `['profile', me]` and in `useSession`'s `user`.
  - `useNotifications()` — enabled only while `status === 'signedIn'`; `refetchInterval: 60_000` only while the app is active (`AppState`), `refetchOnWindowFocus: true`; `useUnreadCount()` → number (0 without data); `useMarkAllRead()` → optimistic: all items `read: true`, `unreadCount: 0`; on error restore and toast.

- [ ] **Step 1: Write the failing tests** — follow from search updates profile and search caches; a failed follow restores only that user and toasts; update profile writes session user; upload writes avatarUrl; notifications disabled when signed out; mark all read sets unreadCount to 0 immediately and restores on error.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add profile, follow and notification queries"`

---

### Task 3: Profile components

**Files:**
- Create: `mobile/src/features/profiles/ProfileHeader.tsx`, `mobile/src/features/profiles/FollowButton.tsx`, `mobile/src/features/profiles/PersonRow.tsx`
- Test: `mobile/src/features/profiles/__tests__/components.test.tsx`

**Interfaces:**
- Produces:
  - `ProfileHeader({ profile, actions })` — banner 3:1 (`resolveImageUrl(bannerUrl)`, `surface` fallback; label `Capa de <name>` or `Sem capa`), avatar 88 px overlapping the banner bottom-left with a 3 px `bg` ring (label `Foto de <name>` or `Sem foto`); then display name (`fontSize.xl`, `textStrong`), `@username` (`textMuted`), bio when present; counts row `<n> seguidores` / `<n> seguindo` / `<n> registros` (singular `1 seguidor`, `1 registro`); `actions` rendered at the right of the name row.
  - `FollowButton({ userId, following, name })` — `Button` `Seguir` (primary) or `Seguindo` (secondary), labels `Seguir <name>` / `Deixar de seguir <name>`, calls `useToggleFollow().mutate({ id, follow: !following })`.
  - `PersonRow({ person, onPress })` — avatar 48, name, `@username`, bio (1 line, `textMuted`), `FollowButton` at the right (hidden for the signed-in user); the row (not the button) is pressable with label `Perfil de <name>`.

- [ ] **Step 1: Write the failing tests** — header counts singular/plural, bio hidden when empty, banner/avatar fallbacks labels; FollowButton labels and mutate payload; PersonRow press and hidden follow for self.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add profile header, follow button and person row"`

---

### Task 4: Profile screen (own and others)

**Files:**
- Create: `mobile/src/features/profiles/ProfileScreen.tsx`, `mobile/src/features/profiles/ProfileGames.tsx`, `mobile/src/features/profiles/ProfilePosts.tsx`, `mobile/src/app/users/_layout.tsx`, `mobile/src/app/users/[id].tsx`
- Modify: `mobile/src/app/(tabs)/profile.tsx` (render `ProfileScreen` for the signed-in user), `mobile/src/app/(tabs)/_layout.tsx` (Perfil header: settings icon button `Configurações` → `/settings`, plus `HeaderBell`), `SessionGate` (register `users`)
- Test: `mobile/src/features/profiles/__tests__/ProfileScreen.test.tsx`

**Behavior and copy (exact):**
- `ProfileHeader`; actions: own → `Button` `Editar perfil` (secondary) → `/me/edit`; others → `FollowButton`.
- `Tabs` `Jogos`, `Atividade`, `Posts`.
- `Jogos`: when the user has favorites, section `Favoritos` with a horizontal row of `GameCover` (width 80, pressable → `/games/<igdbId>`); then the collection: status `Tabs` with counts (`Todos (<n>)`, … — reuse `buildLibraryOverview` from the library) and a `CoverGrid` of cards (cover + status icon under `Todos` + footer with the newest date); card press → `/games/<igdbId>`. Empty collection: own `Sua coleção está vazia` / `Adicione jogos na Biblioteca.`; others `Coleção vazia` / `Esta pessoa ainda não registrou jogos.`; empty status: `Nenhum jogo neste status.`
- `Atividade` / `Posts`: `PostList`-style list of `ActivityCard` / `PostCard` from `useUserPosts(id, 'activity' | 'post')`; empty `Ainda não há atividades` / `Ainda não há posts`.
- `/users/[id]` where id is the signed-in user → `router.replace('/profile')`. Unknown user (404) → `EmptyState` `Perfil não encontrado` / `Esta conta pode ter sido removida.` / action `Voltar` → `router.back()`. Other errors → `Não foi possível carregar o perfil` / `Tentar de novo`. Refetch failure keeps loaded data.
- Header title of `/users/[id]`: the display name once loaded.

- [ ] **Step 1: Write the failing tests** — own profile shows `Editar perfil` and no follow button; other shows `Seguir`; `/users/<myId>` replaces to `/profile`; 404 copy; Jogos tab favorites row and status tabs; empty copies for own vs other; Atividade/Posts call `useUserPosts` with the right type.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add own and public profile screens"`

---

### Task 5: Edit profile with avatar and banner upload

**Files:**
- Create: `mobile/src/features/profiles/EditProfileScreen.tsx`, `mobile/src/features/profiles/pickImage.ts`, `mobile/src/features/profiles/profileRules.ts`, `mobile/src/app/me/_layout.tsx`, `mobile/src/app/me/edit.tsx`
- Modify: `SessionGate` (register `me`)
- Test: `mobile/src/features/profiles/__tests__/EditProfileScreen.test.tsx`, `mobile/src/features/profiles/__tests__/profileRules.test.ts`

**Interfaces:**
- `pickImage(kind: ImageKind): Promise<PickedImage | null>` — `expo-image-picker` (`npx expo install expo-image-picker`), images only, `allowsEditing: true`, `aspect` `[1, 1]` for avatar and `[3, 1]` for banner, `quality: 0.85`; returns null when cancelled; requests media-library permission when needed.
- `validateProfile({ name, username, bio })` — name blank → `Informe seu nome`; name > 50 → `Use no máximo 50 caracteres`; username rules as registration (`Use pelo menos 3 caracteres`, `Use apenas letras, números e _`, `Use no máximo 30 caracteres`); bio > 280 → `Use no máximo 280 caracteres`.

**Behavior and copy (exact):**
- Title `Editar perfil`. Section `Fotos` with helper `Salvas ao confirmar o recorte.`: banner preview with `Alterar capa`, avatar preview with `Alterar foto`. Picking uploads immediately; while uploading show `Enviando imagem…` over that preview and disable both buttons; success `showToast('Foto atualizada')` / `showToast('Capa atualizada')`; a file over 8 MB (when `size` is known) → error under the section `A imagem passa de 8 MB. Escolha uma menor.` without uploading; upload failure → `authErrorMessage(error)` under the section with `Tentar de novo` (re-uploads the same image).
- Section `Informações` with helper `Salvas no botão Salvar alterações.`: `TextField` `Nome`, `Username` (helper `Letras, números e _`), `Bio` (multiline, placeholder `Conte um pouco sobre você`, `maxLength` 280, counter `<n>/280`).
- `Salvar alterações` sends only changed fields (trimmed; blank bio sends `''`); no changes → go back without a request; 409 → field error `Esse username já está em uso`; success → `showToast('Perfil atualizado')` and `router.back()`. Saving while an upload is running → `Aguarde o envio da imagem terminar.`
- Leaving with unsaved text changes: `ConfirmDialog` `Descartar alterações?` / `Nome, username e bio não foram salvos. Fotos que você já enviou continuam salvas.` / `Descartar` (destructive) / `Continuar editando` (`usePreventRemove` from expo-router).

- [ ] **Step 1: Write the failing tests** — rules messages; 9 MB image refused without upload; upload success toast and preview URL; upload failure + retry; only changed fields sent; no-change save makes no request; 409 maps to the username field; save during upload message; discard dialog.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add profile editing with avatar and banner upload"`

---

### Task 6: People search in Explore

**Files:**
- Create: `mobile/src/features/profiles/PeopleSearch.tsx`
- Modify: `mobile/src/features/games/ExploreScreen.tsx` (top `Tabs` `Jogos` / `Pessoas`; the game grid is unchanged under `Jogos`)
- Test: `mobile/src/features/profiles/__tests__/PeopleSearch.test.tsx`, extend `ExploreScreen.test.tsx`

**Behavior and copy (exact):** `TextField` `Buscar pessoas`; under 2 letters `Encontre pessoas` / `Busque pelo nome ou username. Digite pelo menos 2 letras.`; no results `Ninguém encontrado` / `Nada para "<term>".`; error `Não foi possível buscar agora` / `Tentar de novo`; results as `PersonRow`, press → `/users/<id>`. The Home "Seguindo" empty state's `Encontrar pessoas` now opens Explore with the `Pessoas` tab (`/explore?tab=people`).

- [ ] **Step 1: Write the failing tests** — hint, results, empty copy with the term, follow from the row, `?tab=people` opens the people tab.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add people search to Explore"`

---

### Task 7: Notifications center and unread badge

**Files:**
- Create: `mobile/src/features/notifications/NotificationsScreen.tsx`, `mobile/src/features/notifications/NotificationRow.tsx`
- Modify: `mobile/src/app/notifications.tsx` (render the screen; header right `Marcar todas como lidas` icon button, Ionicons `checkmark-done`, disabled with 0 unread), `mobile/src/components/HeaderBell.tsx` (badge with `useUnreadCount()`: hidden at 0, `9+` above 9, `accent` background; label `Notificações, <n> não lidas` when > 0)
- Test: `mobile/src/features/notifications/__tests__/NotificationsScreen.test.tsx`, extend the HeaderBell test

**Behavior and copy (exact):**
- Filter `Tabs`: `Tudo`, `Interações` (like + comment), `Seguidores` (follow).
- Row: actor `Avatar` 40, `<displayName> curtiu seu post` / `comentou no seu post` / `começou a seguir você` with the name bold, relative time; unread rows on `surface` with an `accent` dot; label `<Não lida. ><name> <text>, <relative time>`. Press: like/comment with `postId` → `/posts/<postId>`; follow → `/users/<actor.id>`. Opening an item does not mark anything as read (the backend only has read-all).
- Empty: `Sem notificações` / `Curtidas, comentários e novos seguidores aparecem aqui.`; empty filter: `Nada em "<filter>"`; with 50 items a footer `Mostrando as 50 mais recentes.`; pull to refresh; error without data `Não foi possível carregar as notificações` / `Tentar de novo`.

- [ ] **Step 1: Write the failing tests** — texts per type, filters, unread label, navigation per type, mark-all disables the button and clears the badge immediately, badge `9+`.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add notifications center and unread badge"`

---

### Task 8: Settings and pressable authors

**Files:**
- Create: `mobile/src/features/profiles/SettingsScreen.tsx`, `mobile/src/app/settings.tsx`
- Modify: `SessionGate` (register `settings` as a stack screen with title `Configurações`); `mobile/src/app/(tabs)/profile.tsx` (remove the placeholder `Sair da conta`); `PostCard`, `ActivityCard`, `CommentItem` (avatar and name pressable → `/users/<author.id>`, label `Perfil de <name>`; keep the card body press); `GameCommunity` players (row pressable → `/users/<id>`); `HomeScreen` header left: the signed-in user's `Avatar` 32 (label `Seu perfil`) → `/profile`
- Test: `mobile/src/features/profiles/__tests__/SettingsScreen.test.tsx`, extend the feed/game community tests

**Behavior and copy (exact):** Settings sections: `Conta` — `Editar perfil` (→ `/me/edit`) and `Sair` (→ `ConfirmDialog` `Sair da conta?` / `Sair` (destructive) / `Continuar no app`, then `signOut()`); `Biblioteca` — `Ordenar por` with the five library sorts as `ChoiceChip`s bound to `useLibraryPrefs`; `Sobre` — `GameTracker` and `Versão <version>` from `expo-constants` (`Constants.expoConfig?.version`).

- [ ] **Step 1: Write the failing tests** — sign-out confirm flow; sort chips change the preference; version text; tapping a post author navigates to `/users/<id>` without opening the post; player row navigates; Home avatar navigates to `/profile`.
- [ ] **Step 2–3: fail, implement.**
- [ ] **Step 4: Run all checks** — `npm run typecheck && npm run lint && npm test` in `mobile/` → all exit 0.
- [ ] **Step 5: Verify in the browser** — start `EXPO_PUBLIC_API_URL=https://gt.marcuscoelho.com npx expo start --web --port 8081`, confirm the bundle builds and `/profile`, `/settings`, `/notifications` respond without runtime errors in the log, stop the server. No login.
- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): add settings and open profiles from authors"`
