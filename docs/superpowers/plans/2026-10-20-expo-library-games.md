# Expo Library and Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Library and Explore placeholders with the real library (cover grid, status tabs, sorts, search, platform filter), game search, the game page and the play-record form.

**Architecture:** Pure logic lives in small tested modules (`src/lib/`, `src/features/library/groups.ts`, `src/features/library/rules.ts`). Data goes through typed `api.ts` modules and TanStack Query hooks in `queries.ts`. Screens in `src/app/` compose feature components. The library groups records by game exactly like the Flutter client (`frontend/lib/features/library/application/library_groups.dart` is the behavioral reference).

**Tech Stack:** Expo SDK 58, Expo Router, TypeScript strict, TanStack Query, Zustand, `@shopify/flash-list`, `@react-native-async-storage/async-storage`, `@expo/vector-icons` (Ionicons), Jest + React Native Testing Library 14 (async API), MSW.

**Spec:** `docs/superpowers/specs/2026-10-20-expo-migration-redesign-design.md` (sub-project 2, "Library and games").

## Global Constraints

- All work on `develop`. Conventional Commits with scope `mobile`. Commit messages, code, comments and docs never name the products used as design references.
- Routes live in `mobile/src/app/`; alias `@/*` → `mobile/src/*`. RNTL 14 is async (`await render`, `await fireEvent...`).
- Theme: only tokens from `@/theme/tokens` (no raw hex in components). Dark only. `textMuted` never on `active`.
- User-facing copy is Brazilian Portuguese, exactly as written in this plan.
- API base already ends in `/api` (`apiBaseUrl`); all calls go through `api` from `@/features/auth` (authenticated client).
- Backend is unchanged. Routes: `GET /game-entries/me?sort=recent`, `POST /game-entries`, `PATCH /game-entries/:id`, `DELETE /game-entries/:id`, `GET /games/search?q=`, `GET /games/igdb/:igdbId`, `GET /games/:id/stats`, `GET /games/:id/players?status=&scope=&limit=`, `POST|DELETE /games/:id/favorite`.
- Status values and labels: `backlog` "Na fila" (Ionicons `bookmark-outline`), `playing` "Jogando" (`play-circle-outline`), `completed` "Concluído" (`checkmark-circle-outline`), `dropped` "Abandonado" (`close-circle-outline`). Status is never shown by color alone.
- Cover grid: 4 columns on phones (`columns = max(2, floor((width + 8) / (76 + 8)))`, capped at 8), gap 8, 3:4 covers, radius `radii.cover`, 1 px `border`. Footer pill height 22 under each cover, slot always reserved.
- The Flutter client in `frontend/` is not touched.

## Review Focus

1. A record edited without changing anything sends no PATCH and the form simply closes; editing one field sends only that field, and clearing an optional field sends `null` (test in Task 2).
2. Hours typed with a comma (`12,5`), with a dot, or garbage (`12h`): comma and dot both save `12.5`; garbage shows `Use só números, como 12 ou 12,5.` and blocks saving (test in Task 9).
3. A game with no cover URL, a broken cover URL, or a backend cover URL pointing at `localhost`: the cover shows the name fallback, and backend image paths are rewritten to the configured API host (tests in Tasks 1 and 5).
4. Signing out and into another account must not show the previous account's library or a stale game page (query cache cleared — test in Task 3).
5. Searching for games while typing fast: only the last term's results are shown, terms under 2 letters never hit the API (test in Task 3).

---

### Task 1: Pure helpers (dates, hours, text folding, image URLs)

**Files:**
- Create: `mobile/src/lib/dateOnly.ts`, `mobile/src/lib/hours.ts`, `mobile/src/lib/foldText.ts`, `mobile/src/lib/imageUrl.ts`
- Modify: `mobile/src/lib/env.ts` (add `apiOrigin`)
- Test: `mobile/src/lib/__tests__/dateOnly.test.ts`, `hours.test.ts`, `foldText.test.ts`, `imageUrl.test.ts`

**Interfaces:**
- Produces:
  - `type DateOnly = { year: number; month: number; day: number }`; `parseApiDate(value: string): DateOnly` (accepts `YYYY-MM-DD` or an ISO timestamp, uses its date part); `toApiDate(d: DateOnly): string` (`YYYY-MM-DD`); `formatDate(d: DateOnly): string` (`dd/mm/aaaa`); `parseDisplayDate(text: string): DateOnly | null` (`dd/mm/aaaa`, rejects impossible dates like `31/02/2026`); `todayDate(now?: Date): DateOnly` (local calendar day); `compareDates(a, b): number`; `daysThrough(start, end): number` (inclusive calendar days; 1 when equal; ≤ 0 when end < start).
  - `MAX_HOURS = 99999`; `parseHours(input: string): number | null` (trims, accepts `,` or `.`, regex `^\d+(\.\d+)?$`, rounds to one decimal); `formatHours(value: number): string` (one decimal, comma: `20,0`); `hoursInputText(value: number): string` (`20` for whole numbers, else `12,5`); `maxPlausibleHours(start: DateOnly | null, end: DateOnly | null, today: DateOnly): number` (no start → `MAX_HOURS`; else `min(daysThrough(start, end ?? today) * 24, MAX_HOURS)`; `MAX_HOURS` when days ≤ 0).
  - `foldText(text: string): string` — lower case, strip diacritics (`normalize('NFD')` + remove combining marks), map `ß→ss`, `æ→ae`, `œ→oe`, `ø→o`, `ł→l`, trim, collapse whitespace.
  - `apiOrigin: string` in `env.ts` — `apiBaseUrl` without the trailing `/api`.
  - `resolveImageUrl(url: string | null | undefined, origin?: string): string | null` — null/empty → `null`; URL without scheme → unchanged; absolute URL whose path starts with `/api/images/` or `/uploads/` → same path and query on `origin` (default `apiOrigin`); any other URL unchanged.

- [ ] **Step 1: Write the failing tests**

- `dateOnly`: `parseApiDate('2026-03-05')` and `parseApiDate('2026-03-05T00:00:00.000Z')` → `{2026,3,5}`; `toApiDate` round-trips; `formatDate` → `05/03/2026`; `parseDisplayDate('31/02/2026')` → `null`, `('5/3/2026')` → `null`, `('05/03/2026')` → `{2026,3,5}`; `daysThrough` same day → 1, Jan 1 → Jan 3 → 3, reversed → ≤ 0.
- `hours`: `parseHours('12,5')` and `('12.5')` → `12.5`; `('12')` → `12`; `('12h')`, `('')`, `('-1')` → `null`; `('1.26')` → `1.3`; `formatHours(20)` → `'20,0'`; `hoursInputText(20)` → `'20'`, `(12.5)` → `'12,5'`; `maxPlausibleHours(null, null, t)` → `99999`; start Jan 1, end Jan 2 → `48`; start = today → `24`.
- `foldText('  Pokémon   Ônix ')` → `'pokemon onix'`; `foldText('Straße')` → `'strasse'`.
- `imageUrl`: `resolveImageUrl('http://localhost:3000/api/images/cover?id=1', 'https://gt.example.com')` → `'https://gt.example.com/api/images/cover?id=1'`; `/uploads/a.png` likewise; `'https://images.igdb.com/x.jpg'` unchanged; `null` and `''` → `null`; `'relative/path.png'` unchanged.

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib` → FAIL, modules not found.
- [ ] **Step 3: Implement the four modules and `apiOrigin`.**
- [ ] **Step 4: Run to verify pass** — `npx jest src/lib` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add date, hours, text and image URL helpers"`

---

### Task 2: Game and library API modules

**Files:**
- Create: `mobile/src/features/games/types.ts`, `mobile/src/features/games/api.ts`, `mobile/src/features/library/types.ts`, `mobile/src/features/library/status.ts`, `mobile/src/features/library/api.ts`
- Test: `mobile/src/features/games/__tests__/api.test.ts`, `mobile/src/features/library/__tests__/api.test.ts` (node env + MSW, as in `src/lib/http/__tests__`)

**Interfaces:**
- Consumes: `api` (`@/features/auth`), `DateOnly` helpers (Task 1), `GameStatus` (`@/theme/tokens`).
- Produces:
  - games/types: `GameSummary { igdbId: number; name: string; coverUrl: string | null; platforms: string[]; genres: string[] }`; `Game { id: string; igdbId: number; name: string; coverUrl: string | null; summary: string | null; screenshots: string[]; platforms: string[]; genres: string[]; isFavoritedByMe: boolean }`; `GameStats { backlog: number; playing: number; completed: number; dropped: number }`; `UserSummary { id: string; username: string; name: string | null; avatarUrl: string | null }`; `GamePlayer { user: UserSummary; status: GameStatus; hoursPlayed: number | null }`. Missing arrays parse as `[]`, missing booleans as `false`, missing counts as `0`.
  - games/api: `gamesApi.search(term: string, signal?: AbortSignal): Promise<GameSummary[]>`, `byIgdbId(igdbId: number): Promise<Game>`, `stats(gameId: string): Promise<GameStats>`, `players(gameId: string, opts: { status: GameStatus; scope: 'all' | 'following'; limit: number }): Promise<GamePlayer[]>`, `setFavorite(gameId: string, favorite: boolean): Promise<void>`.
  - library/status: `STATUSES: readonly GameStatus[]` in order `playing, completed, backlog, dropped`; `statusLabel: Record<GameStatus, string>`; `statusIcon: Record<GameStatus, IoniconName>` (values in Global Constraints); `parseStatus(value: string): GameStatus` (unknown → `backlog`).
  - library/types: `GameEntry { id: string; platform: string; status: GameStatus; startedAt: DateOnly | null; finishedAt: DateOnly | null; hoursPlayed: number | null; rating: number | null; notes: string | null; createdAt: Date; game: Game }`; `EntryDraft { platform: string; status: GameStatus; startedAt: DateOnly | null; finishedAt: DateOnly | null; hoursPlayed: number | null; rating: number | null; notes: string | null }`; `parseEntry(json): GameEntry` (`hoursPlayed` may arrive as a string like `"20.0"`; parse with `Number`).
  - library/api: `createBody(igdbId: number, d: EntryDraft): Record<string, unknown>` (omits null fields and blank notes; trims notes; dates as `YYYY-MM-DD`); `updateBody(original: GameEntry, edited: EntryDraft): Record<string, unknown>` (only changed fields; a cleared optional field → `null`; empty object when nothing changed; notes compared trimmed, blank = null); `libraryApi.listMine(): Promise<GameEntry[]>` (`GET /game-entries/me?sort=recent`), `create(igdbId, d): Promise<GameEntry>`, `update(original, edited): Promise<GameEntry>` (returns `original` without a request when `updateBody` is empty), `remove(entryId: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

- `parseEntry` with `hoursPlayed: "20.0"`, `startedAt: "2026-03-05"`, missing `notes` → `20`, `{2026,3,5}`, `null`.
- `createBody` omits `startedAt`/`hoursPlayed`/`rating`/`notes` when null and drops `notes: '   '`; includes `igdbId`, `platform`, `status`.
- `updateBody`: unchanged draft → `{}`; only rating changed 8 → 9 → `{ rating: 9 }`; hours cleared → `{ hoursPlayed: null }`; date set → `{ startedAt: '2026-03-05' }`.
- `libraryApi.update` with an unchanged draft makes no HTTP request (MSW handler counts 0) and resolves to the original.
- `gamesApi.search('hades')` sends `GET /api/games/search?q=hades`; `setFavorite(id, true)` sends `POST`, `false` sends `DELETE`; `players` sends `status`, `scope`, `limit` query params.

- [ ] **Step 2: Run to verify failure** — `npx jest src/features/games src/features/library` → FAIL.
- [ ] **Step 3: Implement the five modules.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add typed game and library API clients"`

---

### Task 3: Queries, filters and preferences

**Files:**
- Create: `mobile/src/features/library/queries.ts`, `mobile/src/features/library/filterStore.ts`, `mobile/src/features/library/prefsStore.ts`, `mobile/src/features/games/queries.ts`, `mobile/src/lib/useDebouncedValue.ts`
- Test: `mobile/src/features/library/__tests__/queries.test.tsx`, `mobile/src/features/games/__tests__/queries.test.tsx`, `mobile/src/features/library/__tests__/stores.test.ts`

**Interfaces:**
- Consumes: Task 2 APIs; `queryClient` and `useSession` (`@/features/auth`).
- Produces:
  - Query keys: `['library']`, `['game', igdbId]`, `['gameStats', gameId]`, `['gamePlayers', gameId, scope]`, `['gameSearch', term]`.
  - `useLibrary()` (list of `GameEntry`); `useCreateEntry()`, `useUpdateEntry()`, `useDeleteEntry()` — mutations that invalidate `['library']` on success.
  - `useGame(igdbId: number)`; `useGameStats(gameId?: string)`; `useGamePlayers(gameId: string | undefined, scope: 'all' | 'following')` (status `playing`, limit 10); `useToggleFavorite(igdbId: number)` — optimistic update of `['game', igdbId].isFavoritedByMe`, rolled back on error.
  - `useGameSearch(term: string)` — debounced 300 ms via `useDebouncedValue(value, ms)`; disabled when the trimmed term has fewer than 2 characters; passes the query's `signal` to `gamesApi.search` so superseded requests abort; keeps previous results while loading the next term (`placeholderData: keepPreviousData`).
  - `useLibraryFilter` (Zustand, memory only, reset on sign-out): `{ query: string; status: GameStatus | null; platformKey: string | null; setQuery; setStatus; setPlatform; clear }`.
  - `useLibraryPrefs` (Zustand persisted with AsyncStorage under key `library.sort`): `{ sort: LibrarySort; setSort }`; `type LibrarySort = 'recent' | 'oldest' | 'mostPlayed' | 'rating' | 'name'`; default `'recent'`; unknown stored value → `'recent'`.
- Sign-out: subscribe once to `useSession` and call `useLibraryFilter.getState().clear()` when status becomes `signedOut` (the query cache is already cleared by the auth store).

- [ ] **Step 1: Write the failing tests**

- Mutation `useCreateEntry` success invalidates `['library']` (spy on `queryClient.invalidateQueries`).
- `useToggleFavorite` flips `isFavoritedByMe` immediately and restores it when the request fails.
- `useGameSearch('h')` makes no request; `'ha'` → `'hades'` typed within 300 ms makes exactly one request, for `hades` (use fake timers).
- `useLibraryFilter` is cleared when `useSession` status changes to `signedOut`, and `useLibrary` refetches (no cached records of the previous account) after `queryClient.clear()`.
- `useLibraryPrefs` reads a stored `'rating'`, falls back to `'recent'` for `'bogus'`, and writes on `setSort`.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — `npx expo install @react-native-async-storage/async-storage`; use its jest mock (`@react-native-async-storage/async-storage/jest/async-storage-mock`) in tests.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add library and game queries, filters and sort preference"`

---

### Task 4: Library grouping, filtering and sorting

**Files:**
- Create: `mobile/src/features/library/groups.ts`
- Test: `mobile/src/features/library/__tests__/groups.test.ts`

**Interfaces:**
- Consumes: `GameEntry` (Task 2), `foldText` (Task 1), `LibrarySort`, filter shape (Task 3).
- Produces:
  - `type LibraryGroup = { game: Game; entries: GameEntry[]; totalEntries: number }` with helpers `singleStatus(g): GameStatus | null` (null when entries have several statuses), `knownHours(g): number | null` (sum of known hours; null when none), `bestRating(g): number | null`, `hasNotes(g): boolean`, `newestAddedAt(g): Date`, `oldestAddedAt(g): Date`, `platformsOf(g): string[]` (distinct by `foldText`, in entry order).
  - `type LibraryOverview = { groups: LibraryGroup[]; statusCounts: Record<GameStatus, number>; totalGames: number; platforms: { key: string; label: string }[]; summary: { games: number; records: number; playingGames: number } }`.
  - `buildLibraryOverview(entries: GameEntry[], filter: { query: string; status: GameStatus | null; platformKey: string | null }, sort: LibrarySort): LibraryOverview`.

Behavior (same as the Flutter reference):
- Entries group by `game.id`; each group's entries are newest first (by `createdAt`, then `id`).
- Search (folded, substring of the game name) and platform (folded equality) apply first; `statusCounts` and `totalGames` are computed after search and platform but before status, counting a game once per status it has.
- Status filter keeps only matching entries; groups left empty disappear; `totalEntries` is always the game's full count.
- `platforms` lists every platform in the library (key = folded text, label = first spelling seen), sorted by key.
- Sorts: `recent` newest added first; `oldest` oldest added first; `mostPlayed` most known hours first, groups without hours last; `rating` best rating first, unrated last; `name` folded name A–Z. Ties break by folded name, then `game.id`.

- [ ] **Step 1: Write the failing tests** — one test per rule above, including: two entries of one game become one group with `totalEntries 2`; status `playing` on a game with playing + completed entries keeps the group with one entry and `totalEntries 2`; `statusCounts` unaffected by the status filter; `'pokemon onix'` finds `Pokémon Ônix`; platform `PS5` vs `ps5 ` match; `mostPlayed` puts a game with `0` hours before one with no hours.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement `groups.ts`.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): group, filter and sort library records by game"`

---

### Task 5: Cover components

**Files:**
- Create: `mobile/src/components/GameCover.tsx`, `CoverGrid.tsx`, `CoverFooter.tsx`, `StatusIcon.tsx`, `RatingStars.tsx`; export from `mobile/src/components/index.ts`
- Test: `mobile/src/components/__tests__/covers.test.tsx`

**Interfaces:**
- Consumes: tokens; `resolveImageUrl` (Task 1); `statusIcon`, `statusLabel` (Task 2).
- Produces:
  - `GameCover({ name: string; url: string | null; width?: number })` — 3:4 box, radius `radii.cover`, 1 px `border`; `Image` with `resolveImageUrl(url)`; when the URL is null or the image errors, a `surface` box showing `name` (up to 4 lines, centered) — or an Ionicons `game-controller-outline` icon when narrower than 80; `accessibilityLabel` `Capa de <name>`.
  - `CoverGrid<T>({ data: T[]; keyExtractor: (t: T) => string; renderItem: (t: T, width: number) => ReactNode; onRefresh?: () => void; refreshing?: boolean; ListHeaderComponent?; ListEmptyComponent?; minItemWidth?: number })` — `FlashList` with the column formula and gap from Global Constraints; computes item width from the measured container width; `minItemWidth` (default 76) replaces 76 in the column formula.
  - `CoverFooter({ children })` — pill of height 22, `surface` background, 1 px `border`, radius 6, horizontal padding `space.sm`, `fontSize.xs` bold `text`; content scales down to fit (no overflow).
  - `StatusIcon({ status: GameStatus | null })` — 22 px circle, `bg` at 92% opacity, Ionicons status icon (or `layers-outline` when null) in `colors.status[status]` / `textMuted`; not focusable (the card's label carries the status).
  - `RatingStars({ rating: number; size?: number })` — 1–10 as five Ionicons stars (`star`, `star-half`, `star-outline`) in `accent`; `accessibilityLabel` `Nota <n> de 10`.

- [ ] **Step 1: Write the failing tests** — fallback shows the name when `url` is null and after `onError`; a backend URL is passed to `Image` rewritten to `apiOrigin`; `RatingStars rating={7}` renders 3 `star`, 1 `star-half`, 1 `star-outline` and label `Nota 7 de 10`; `StatusIcon status="playing"` renders `play-circle-outline`; `CoverGrid` renders 4 columns in a 390 px wide container (16 px page padding each side) — assert the computed item width is `(358 - 3 * 8) / 4`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — `npx expo install @shopify/flash-list`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add cover, grid, footer, status icon and rating components"`

---

### Task 6: Overlay components (toast, confirm dialog, option sheet, choice chip)

**Files:**
- Create: `mobile/src/components/Toast.tsx` (+ `mobile/src/lib/toast.ts` store), `ConfirmDialog.tsx`, `OptionSheet.tsx`, `ChoiceChip.tsx`; export from `index.ts`; mount `<ToastHost />` in `mobile/src/app/_layout.tsx`
- Test: `mobile/src/components/__tests__/overlays.test.tsx`

**Interfaces:**
- Produces:
  - `showToast(message: string)` (Zustand store in `lib/toast.ts`); `<ToastHost />` renders the latest message at the bottom above the tab bar on `surface` with `textStrong`, `accessibilityLiveRegion="polite"`, auto-hides after 3 s.
  - `ConfirmDialog({ visible; title; message?; confirmLabel; cancelLabel; destructive?: boolean; onConfirm; onCancel })` — RN `Modal` (works on web), `accessibilityViewIsModal`; destructive confirm text in `danger`.
  - `OptionSheet<T>({ visible; title; options: { value: T; label: string; icon?: IoniconName }[]; selected?: T; onSelect(value: T); onClose })` — bottom sheet in a `Modal`, each option a 48 px row with `accessibilityState.selected`.
  - `ChoiceChip({ label; selected; onPress; icon?: IoniconName; accessibilityLabel? })` — min height 48 (touch target), selected = `active` background + `textStrong`, unselected = `surface` + `text`.

- [ ] **Step 1: Write the failing tests** — `showToast('Registro criado')` shows the text and it disappears after 3 s (fake timers); `ConfirmDialog` calls `onConfirm`/`onCancel`; `OptionSheet` marks the selected option and reports a press; `ChoiceChip` exposes `selected` and min height 48.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add toast, confirm dialog, option sheet and choice chip"`

---

### Task 7: Library screen

**Files:**
- Create: `mobile/src/features/library/LibraryScreen.tsx`, `mobile/src/features/library/LibraryCard.tsx`, `mobile/src/features/library/libraryFooter.tsx`
- Modify: `mobile/src/app/(tabs)/library.tsx` (render `LibraryScreen`), `mobile/src/app/(tabs)/_layout.tsx` (Biblioteca header: `HeaderBell` plus an add button)
- Test: `mobile/src/features/library/__tests__/LibraryScreen.test.tsx`

**Interfaces:**
- Consumes: Tasks 3–6; `Tabs`, `TextField`, `EmptyState`, `Skeleton`, `Screen` (Foundation).
- Produces: `libraryFooter(group: LibraryGroup, sort: LibrarySort): ReactNode | null` — `recent` → newest added date `dd/mm/aa`; `oldest` → oldest added date `dd/mm/aa`; `mostPlayed` → `<formatHours> h` (null without hours); `rating` → `RatingStars` + Ionicons `heart` in `accent` when `game.isFavoritedByMe` + Ionicons `document-text-outline` in `textMuted` when `hasNotes` (null when none of the three); `name` → null.

Screen, top to bottom (exact copy):
- Summary line in `textMuted`: `<n> jogo(s) · <n> registro(s)` plus ` · <n> jogo(s) em andamento` when any; singular `1 jogo`, `1 registro`, `1 jogo em andamento`.
- Status `Tabs`: `Todos (<totalGames>)`, then `Jogando (n)`, `Concluído (n)`, `Na fila (n)`, `Abandonado (n)` from `statusCounts`.
- `TextField` label `Buscar na biblioteca`; a `Plataforma` button (opens `OptionSheet` titled `Plataforma`: `Todas as plataformas` + platforms; shows the chosen platform's label when active); an `Ordenar` button (opens `OptionSheet` titled `Ordenar por`: `Adicionados recentemente`, `Adicionados há mais tempo`, `Mais horas registradas`, `Minha nota`, `Nome A–Z`); a `Limpar` text button only while a filter is active.
- Result count line with `accessibilityLiveRegion="polite"`: `1 jogo encontrado` / `<n> jogos encontrados`.
- `CoverGrid` of `LibraryCard`: `GameCover`, `StatusIcon` (only when the status tab is `Todos`) at bottom-left over the cover, `CoverFooter` with `libraryFooter`. The card is one pressable with `accessibilityRole="button"` and label `<game name>, <status label or "Vários status">, <records label or first platform or "Plataforma não informada">`; records label `<n> registros` when the game has more than one. Press → `/games/<igdbId>?tab=progress`.
- Pull to refresh refetches; loading shows a grid of `Skeleton` covers; error shows `EmptyState` `Não foi possível carregar a biblioteca` with action `Tentar de novo`.
- No records at all: `EmptyState` `Sua biblioteca começa com um jogo` / `Adicione os jogos que você joga, quer jogar ou já zerou.` / action `Encontrar jogo` → `/explore`. Filters with no result: `Nenhum jogo com esses filtros` / `Tente outra busca ou limpe os filtros.` / action `Limpar filtros`.
- Header add button: Ionicons `add`, label `Adicionar jogo`, navigates to `/explore`.

- [ ] **Step 1: Write the failing tests** (mock `useLibrary` data with the fixtures used in Task 4):
  - tabs show counts and selecting `Jogando (1)` leaves one card;
  - `StatusIcon` visible under `Todos`, hidden under `Jogando`;
  - sort `Minha nota` shows `Nota 8 de 10` in the footer; sort `Mais horas registradas` shows `20,0 h`;
  - searching `pokemon onix` finds `Pokémon Ônix` and the count reads `1 jogo encontrado`;
  - empty library shows `Sua biblioteca começa com um jogo`; empty filter result shows `Limpar filtros`, which clears;
  - pressing a card navigates to `/games/<igdbId>?tab=progress` (mock `useRouter`);
  - card accessibility label reads `Hades, Vários status, 2 registros` for a game with two records of different statuses.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add library cover grid with status tabs, search, filter and sort"`

---

### Task 8: Explore (game search) screen

**Files:**
- Create: `mobile/src/features/games/ExploreScreen.tsx`
- Modify: `mobile/src/app/(tabs)/explore.tsx`
- Test: `mobile/src/features/games/__tests__/ExploreScreen.test.tsx`

**Interfaces:**
- Consumes: `useGameSearch` (Task 3), `useLibrary` (for "Na biblioteca"), `GameCover`, `CoverGrid` (Task 5).

Behavior and copy (exact):
- `TextField` label `Buscar jogos`, focused on mount.
- Term under 2 letters: `EmptyState` `Busque um jogo pelo nome` / `Digite pelo menos 2 letras.`
- No results: `EmptyState` `Nenhum jogo encontrado`.
- Results in `CoverGrid` with `minItemWidth={110}` (3 columns on a 390 px phone): `GameCover`, the game name below (2 lines max, `text`), and a `CoverFooter` with `Na biblioteca` when the user has any record of that `igdbId`, else the first platform or `Plataformas não informadas`. Press → `/games/<igdbId>`.
- Error: `EmptyState` `Não foi possível buscar agora` with action `Tentar de novo`.

- [ ] **Step 1: Write the failing tests** — short term shows the hint and makes no request; results render names; a game in the library shows `Na biblioteca`; pressing a result navigates to `/games/<igdbId>`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add game search to Explore"`

---

### Task 9: Record form rules and payload

**Files:**
- Create: `mobile/src/features/library/rules.ts`
- Test: `mobile/src/features/library/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `EntryDraft` (Task 2).
- Produces:
  - `type FormValues = { status: GameStatus; platform: string; startedAt: string; finishedAt: string; hours: string; rating: number | null; notes: string }` (dates and hours as typed text).
  - `initialValues(game: Game, entry?: GameEntry): FormValues` — new record: status `backlog`, platform = the game's only platform when it has exactly one, else `''`; edit: the entry's values (`formatDate`, `hoursInputText`).
  - `validate(v: FormValues, today: DateOnly): Partial<Record<'platform' | 'startedAt' | 'finishedAt' | 'hours' | 'notes', string>>` with exact messages: platform blank → `Informe a plataforma`; date text not blank and not `dd/mm/aaaa` → `Use o formato dd/mm/aaaa.`; finish before start → `O fim não pode ser antes do início.` (on `finishedAt`); hours invalid → `Use só números, como 12 ou 12,5.`; above `MAX_HOURS` → `O máximo é 99999,0 horas.`; above `maxPlausibleHours` → `Isso passa das <ceiling> h possíveis entre início e fim. Confira as datas.` (or `entre o início e hoje` without a finish date); notes over 2000 characters → `Use no máximo 2000 caracteres.`
  - `toDraft(v: FormValues): EntryDraft` — trims platform and notes; blank → null.
  - `isDirty(initial: FormValues, current: FormValues): boolean`.

- [ ] **Step 1: Write the failing tests** — one per message above; `hours: '12,5'` and `'12.5'` both pass and `toDraft` gives `12.5`; `'12h'` fails; start `01/01/2026` + hours `49` with finish `02/01/2026` → the plausibility message with `48`; `isDirty` false for identical values.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement `rules.ts`.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add play record form rules"`

---

### Task 10: Record form screen

**Files:**
- Create: `mobile/src/features/library/RecordForm.tsx`, `mobile/src/app/games/[igdbId]/playthroughs/new.tsx`, `mobile/src/app/games/[igdbId]/playthroughs/[entryId]/edit.tsx`
- Modify: `mobile/src/features/auth/SessionGate.tsx` (register the `games` routes inside the signed-in `Stack.Protected`)
- Test: `mobile/src/features/library/__tests__/RecordForm.test.tsx`

**Interfaces:**
- Consumes: `rules.ts` (Task 9); `useGame`, `useLibrary`, `useCreateEntry`, `useUpdateEntry` (Task 3); `ChoiceChip`, `showToast`, `ConfirmDialog` (Task 6); `TextField`, `Button`, `Screen`.

Layout and copy (exact):
- Header title `Novo registro` / `Editar registro`; the game name as heading. New record when the user already has records of this game: `Você já tem 1 registro deste jogo. Este será um novo registro.` / `Você já tem <n> registros deste jogo. Este será um novo registro.`
- Section `Status`: four `ChoiceChip` with status icons and labels.
- Section `Plataforma`: a `ChoiceChip` per game platform plus `Outra` (Ionicons `create-outline`); choosing `Outra` (or a game without platforms) shows `TextField` `Plataforma` with placeholder `Ex.: PC`, max 50.
- Section `Progresso`: `TextField` `Início` and `Fim` (placeholder `dd/mm/aaaa`, numeric keyboard, auto-inserting `/`), each with a `Hoje` text button that fills today; `TextField` `Horas jogadas` with helper `Opcional. Aceita 12 ou 12,5.`, decimal keyboard.
- Section `Sua avaliação`: `Nota` and the current value (`Sem nota` or `<n>/10`), ten `ChoiceChip` `1`–`10` (accessibility label `Nota <n> de 10`; pressing the selected one clears it), and a `Sem nota` text button when rated.
- Section `Notas pessoais`: multiline `TextField` with helper `Só você vê.`
- `Button` `Salvar registro` (loading while saving). Validation errors show on their fields and block saving. API errors show `authErrorMessage(error)` above the button.
- Success: `showToast('Registro criado')` / `showToast('Registro atualizado')`, then `router.back()`. An edit with no changes just goes back.
- Leaving with unsaved changes (back button or gesture, via `usePreventRemove` from `@react-navigation/native`) opens `ConfirmDialog` `Descartar alterações?` / `O que você preencheu não foi salvo.` / `Descartar` (destructive) / `Continuar editando`.
- Edit route for an entry that does not exist: `EmptyState` `Registro não encontrado` / `Ele pode ter sido removido.` / action `Voltar ao jogo`.

- [ ] **Step 1: Write the failing tests** (mock queries):
  - a new record for a game with platforms `['PC', 'PS5']` saves `{ igdbId, platform: 'PS5', status: 'playing', hoursPlayed: 12.5 }` after choosing `Jogando`, `PS5` and typing `12,5`, then shows `Registro criado` and goes back;
  - blank platform shows `Informe a plataforma` and no save;
  - edit with no changes calls no mutation and goes back;
  - edit changing the rating sends only `{ rating: 9 }`;
  - the replay note appears when the game already has one record;
  - unknown `entryId` shows `Registro não encontrado`;
  - with changes, leaving shows `Descartar alterações?`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add play record form"`

---

### Task 11: Game page

**Files:**
- Create: `mobile/src/features/games/GameScreen.tsx`, `mobile/src/features/games/GameAbout.tsx`, `mobile/src/features/games/GameProgress.tsx`, `mobile/src/features/games/GameCommunity.tsx`, `mobile/src/features/library/EntryCard.tsx`, `mobile/src/app/games/[igdbId]/index.tsx`
- Test: `mobile/src/features/games/__tests__/GameScreen.test.tsx`

**Interfaces:**
- Consumes: `useGame`, `useToggleFavorite`, `useGameStats`, `useGamePlayers`, `useLibrary`, `useUpdateEntry`, `useDeleteEntry` (Task 3); `GameCover`, `RatingStars` (Task 5); `Tabs`, `OptionSheet`, `ConfirmDialog`, `showToast`, `Avatar`, `EmptyState`, `Button`.

Layout and copy (exact):
- Invalid `igdbId` (not a positive integer) or 404: `EmptyState` `Jogo não encontrado` / `O endereço deste jogo não é válido.` / action `Ir para a Biblioteca` → `/library`.
- Header: `GameCover` (width 120), name as heading, platforms joined by ` · `; a favorite icon button (Ionicons `heart` / `heart-outline` in `accent`, label `Favoritar` / `Remover dos favoritos`); primary `Button` `Adicionar à biblioteca` when the user has no record of this game, else `Novo registro`, both → `/games/<igdbId>/playthroughs/new`.
- `Tabs`: `Sobre`, `Meu progresso`, `Comunidade`; initial tab `Meu progresso` when the URL has `?tab=progress`, else `Sobre`.
- `Sobre`: `Sinopse` (6 lines collapsed with `Ler mais` / `Ler menos`; `Este jogo ainda não tem sinopse.` when empty), `Plataformas`, `Gêneros` (as `Pill`s), `Screenshots` (horizontal list of 16:9 images; hidden when none).
- `Meu progresso`: no records → `EmptyState` `Você ainda não registrou este jogo` / `Crie um registro para acompanhar status, horas e nota.` / action `Novo registro`. Otherwise one `EntryCard` per record (newest first): status icon + label, platform, `Início <dd/mm/aaaa>` / `Fim <dd/mm/aaaa>` when set, `<formatHours> h` when set, `RatingStars` when rated, notes (Ionicons `lock-closed-outline` labelled `Nota privada` + text, 3 lines). Each card has a menu button (Ionicons `ellipsis-vertical`, label `Ações do registro`) opening `OptionSheet` with `Alterar status`, `Editar`, `Remover`:
  - `Alterar status` → `OptionSheet` titled `Alterar status` with the four statuses; choosing one calls `useUpdateEntry` and shows `Status alterado`;
  - `Editar` → `/games/<igdbId>/playthroughs/<entryId>/edit`;
  - `Remover` → `ConfirmDialog` `Remover registro?` / `Seus outros registros do jogo continuam.` / `Remover` (destructive) / `Cancelar`; on confirm `useDeleteEntry` and `Registro removido`.
  - A button `Novo registro (replay)` below the cards.
- `Comunidade`: `Registros da comunidade` with the four status counts (icon + label + number) and the note `Conta registros, não pessoas: quem rejoga aparece mais de uma vez.`; `Jogando agora` with helper `Alguns dos jogadores, até 10.`, a two-option `Tabs` `Todos` / `Quem eu sigo`, and a list of players (`Avatar`, name or `@username`, hours when known); empty → `Ninguém está jogando agora.` / `Ninguém que você segue está jogando.`. (Posts about the game arrive with sub-project 3.)

- [ ] **Step 1: Write the failing tests** (mock queries and `useRouter`/`useLocalSearchParams`):
  - `?tab=progress` opens `Meu progresso`;
  - no records → `Adicionar à biblioteca` and the progress empty state;
  - favorite button toggles its label;
  - `Remover` → confirm → delete mutation called with the entry id and `Registro removido` shown;
  - `Alterar status` → `Concluído` calls update with status `completed`;
  - `Comunidade` shows counts and switching to `Quem eu sigo` requests scope `following`;
  - `igdbId=abc` shows `Jogo não encontrado`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`app/games/[igdbId]/index.tsx` is thin; register it in `SessionGate` with the routes from Task 10).
- [ ] **Step 4: Run all checks** — in `mobile/`: `npm run typecheck && npm run lint && npm test` → all exit 0.
- [ ] **Step 5: Verify in the browser** — `EXPO_PUBLIC_API_URL=https://gt.marcuscoelho.com npx expo start --web --port 8081`: the bundle builds and the Library, Explore and a game route load without runtime errors in the dev server log. Stop the server. (Real-account flows are checked by the user.)
- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): add game page with about, progress and community"`
