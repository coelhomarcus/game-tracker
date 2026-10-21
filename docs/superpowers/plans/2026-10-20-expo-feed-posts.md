# Expo Feed and Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Início placeholder with the social feed ("Para você" / "Seguindo"), add creating posts, the post detail with comments and likes, and the posts section of the game page's Comunidade tab.

**Architecture:** Same layering as the previous sub-projects: typed `api.ts`, TanStack Query hooks in `queries.ts` (infinite queries for cursor pages), presentational components in `src/features/feed/`, thin routes in `src/app/`. A post's like state lives in several caches (feeds, game posts, post detail); one helper updates it everywhere so the UI never disagrees with itself.

**Tech Stack:** Expo SDK 58, Expo Router, TypeScript strict, TanStack Query v5 (`useInfiniteQuery`), Zustand, Jest + RNTL 14 (async), MSW.

**Spec:** `docs/superpowers/specs/2026-10-20-expo-migration-redesign-design.md` (sub-project 3 "Social", first half: feed, posts and comments, likes). Profiles, follow, people search, notifications and settings are the second half (sub-project 3b) and are out of scope here.

## Global Constraints

- All work on `develop`. Conventional Commits with scope `mobile`. Commit messages, code, comments and docs never name the products used as design references.
- Routes live in `mobile/src/app/`; alias `@/*` → `mobile/src/*`. RNTL 14 is async.
- Theme tokens only (no raw hex in components); dark only; `textMuted` never on `active`; interactive targets ≥ 48 dp (icon buttons may use `hitSlop`).
- User-facing copy is Brazilian Portuguese, exactly as written in this plan.
- Backend unchanged. Routes: `GET /feed?scope=general|following&cursor=&limit=` and `GET /games/:id/posts?cursor=&limit=` → `{ items: Post[], nextCursor: string | null }`; `GET /posts/:id`; `POST /posts` body `{ content (1–500), gameId?, gameEntryId?, type? }` (type defaults to `status`; do not send `null`s); `POST|DELETE /posts/:id/like`; `GET /posts/:id/comments` → root comments, each with nested `replies` (a reply to a reply is nested under that reply); `POST /posts/:id/comments` body `{ content (1–500), parentCommentId? }`; `POST|DELETE /comments/:id/like`. Page size 20.
- Author display name: `name` when non-blank, else `username`.
- Profiles do not exist yet (sub-project 3b): authors and avatars are not pressable in this sub-project.
- The Flutter client in `frontend/lib/features/feed/` is the behavioral reference; `frontend/` and `backend/` are not modified.

## Review Focus

1. Liking a post on the feed, then opening its detail (or the game page), shows the same liked state and count everywhere; a failed like rolls back everywhere (test in Task 2).
2. Reaching the end of a feed: the next page is fetched once (no duplicate posts when `onEndReached` fires repeatedly), and `Você chegou ao fim.` appears only when `nextCursor` is null (test in Task 3).
3. Switching between "Para você" and "Seguindo" keeps each list's own data and scroll; signing out and in as another user shows none of the previous user's feed (cache cleared — test in Task 2).
4. A comment or post with 500 characters is accepted, 501 is blocked before sending; whitespace-only content cannot be sent (tests in Tasks 5 and 6).
5. Replying to a reply attaches to that reply (`parentCommentId` = the reply's id) and the new comment appears in the thread after sending (test in Task 6).

---

### Task 1: Feed types, API and relative time

**Files:**
- Create: `mobile/src/features/feed/types.ts`, `mobile/src/features/feed/api.ts`, `mobile/src/lib/relativeTime.ts`
- Test: `mobile/src/features/feed/__tests__/api.test.ts` (node env + MSW), `mobile/src/lib/__tests__/relativeTime.test.ts`

**Interfaces:**
- Consumes: `api` (`@/features/auth`), `parseGame`/`Game`/`UserSummary` and its parser (`@/features/games/types`), `parseStatus` (`@/features/library/status`).
- Produces:
  - `type PostType = 'status' | 'review' | 'activity'`; `type FeedScope = 'general' | 'following'`.
  - `Post { id; author: UserSummary; content: string; type: PostType; activityStatus: GameStatus | null; createdAt: Date; game: Game | null; entry: { id: string; platform: string } | null; imageUrl: string | null; likeCount: number; commentCount: number; likedByMe: boolean }` — parsed from `json.user`, `json.gameEntry`; missing counts → 0, missing booleans → false, unknown type → `status`.
  - `PostPage { items: Post[]; nextCursor: string | null }`.
  - `Comment { id; postId; author: UserSummary; content; createdAt: Date; parentCommentId: string | null; likeCount; likedByMe; replies: Comment[] }` (recursive).
  - `displayName(user: UserSummary): string`.
  - `feedApi.feed(scope, cursor?)`, `gamePosts(gameId, cursor?)`, `post(id)`, `create(input: { content: string; gameId?: string; gameEntryId?: string })`, `setLike(postId, liked)`, `comments(postId)`, `addComment(postId, content, parentCommentId?)`, `setCommentLike(commentId, liked)`. All send `limit: 20` where paginated; `create` omits absent ids and trims `content`.
  - `formatRelativeTime(at: Date, now?: Date): string` — exactly as the Flutter reference (`frontend/lib/core/dates/relative_time.dart`): `< 45 s` or future → `agora`; `< 60 min` → `há <n> min` (1–59); `< 24 h` → `há <n> h`; previous calendar day → `ontem`; `< 7` days → `há <n> dias`; same year → `dd/mm`; else `dd/mm/aaaa`.

- [ ] **Step 1: Write the failing tests** — parsing a post with `user`, `game`, `gameEntry`, activity status and missing counts; a comment tree with a reply of a reply; `feed('following')` sends `scope=following&limit=20` and `cursor` only when given; `create` body has no `gameId` key when absent; `setLike` POST/DELETE; `addComment` sends `parentCommentId` only when given; `formatRelativeTime` boundaries (44 s, 45 s, 59 min, 23 h, yesterday at 23:59 vs today 00:01, 6 days, same year, previous year).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add feed types, API client and relative time"`

---

### Task 2: Feed queries and like state

**Files:**
- Create: `mobile/src/features/feed/queries.ts`, `mobile/src/features/feed/postCache.ts`
- Test: `mobile/src/features/feed/__tests__/queries.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - Keys: `['feed', scope]`, `['gamePosts', gameId]`, `['post', id]`, `['comments', postId]`.
  - `useFeed(scope)` and `useGamePosts(gameId?)` — `useInfiniteQuery`, `initialPageParam: undefined`, `getNextPageParam: (last) => last.nextCursor ?? undefined`.
  - `usePost(id)`, `useComments(postId)`.
  - `updatePostEverywhere(client: QueryClient, postId: string, update: (p: Post) => Post): Snapshot` and `restoreSnapshot(client, snapshot)` in `postCache.ts` — walks every cached `['feed', *]`, `['gamePosts', *]` page and `['post', postId]`.
  - `useTogglePostLike()` → `mutate(post: Post)`: optimistic flip of `likedByMe` and `likeCount ± 1` everywhere, rollback everywhere on error, no refetch on success.
  - `useCreatePost()` → `mutateAsync(input)`; on success invalidates `['feed']` and, when the post has a game, `['gamePosts', game.id]`.
  - `useAddComment(postId)` → `mutateAsync({ content, parentCommentId? })`; on success invalidates `['comments', postId]` and bumps `commentCount` by 1 everywhere via `updatePostEverywhere`.
  - `useToggleCommentLike(postId)` → `mutate(comment: Comment)`: optimistic flip inside the `['comments', postId]` tree (any depth), rollback on error.

- [ ] **Step 1: Write the failing tests** (fresh QueryClient per test, API mocked): feed pages chain through `nextCursor`; liking a post present in `['feed','general']`, `['gamePosts', g]` and `['post', id]` updates all three; a failed like restores all three; comment like flips a nested reply and rolls back on error; `useAddComment` invalidates comments and increments `commentCount`; with the shared `queryClient`, `useSession` sign-out clears feed data (assert `getQueryData(['feed','general'])` is undefined after `queryClient.clear()`).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add feed, post and comment queries with shared like state"`

---

### Task 3: Post components and post list

**Files:**
- Create: `mobile/src/features/feed/PostCard.tsx`, `mobile/src/features/feed/ActivityCard.tsx`, `mobile/src/features/feed/PostActions.tsx`, `mobile/src/features/feed/PostGameLink.tsx`, `mobile/src/features/feed/PostList.tsx`
- Test: `mobile/src/features/feed/__tests__/posts.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–2; `Avatar`, `GameCover`, `StatusIcon`/status label, `resolveImageUrl`, tokens.
- Produces:
  - `PostCard({ post, onPress? })` — row: `Avatar` (40), then column: `<displayName>` bold `textStrong` + ` @<username> · <relative time>` in `textMuted`; content (`text`, full); optional image (`resolveImageUrl`, 16:9, radius `radii.card`); `PostGameLink` when `game`; `PostActions`. Whole card pressable (`onPress`), label `Post de <displayName>`.
  - `ActivityCard({ post, onPress? })` — compact: `Avatar` (32), `<displayName> <content>` with the name bold, a status chip (`StatusIcon` + label) for `activityStatus`, relative time, `PostGameLink`, `PostActions`.
  - `PostGameLink({ game })` — pressable row with `GameCover` width 36 and the game name; label `Abrir jogo <name>`; navigates to `/games/<igdbId>`.
  - `PostActions({ post })` — like button (Ionicons `heart` in `accent` when liked, `heart-outline` in `textMuted` otherwise, count) with label `Curtir post, <n> curtidas` / `Descurtir post, <n> curtidas`, calling `useTogglePostLike().mutate(post)`; comment count (Ionicons `chatbubble-outline`) labelled `<n> comentários`, navigating to `/posts/<id>`.
  - `PostList({ query, ListHeaderComponent?, ListEmptyComponent, onRefresh })` — `FlatList` over `query.data.pages.flatMap(p => p.items)`; renders `ActivityCard` for `type === 'activity'`, else `PostCard`; card press → `/posts/<id>`; `onEndReached` calls `fetchNextPage()` only when `hasNextPage && !isFetchingNextPage`; footer: spinner while fetching the next page; on next-page error `Não foi possível carregar mais posts.` + `Tentar de novo` (→ `fetchNextPage`); `Você chegou ao fim.` when there is at least one post and no next page; `refreshing` = `isRefetching && !isFetchingNextPage`; `forwardRef` to the `FlatList` for scroll-to-top.

- [ ] **Step 1: Write the failing tests** — PostCard shows name, `@username · há 5 min` (fixed `now` via fake timers or injected date), content, game link navigating to `/games/<igdbId>`; like button label and mutate call; ActivityCard shows the status label; PostList: `onEndReached` twice while fetching calls `fetchNextPage` once; end message only without next page; next-page error shows the retry and pressing it calls `fetchNextPage`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add post cards and infinite post list"`

---

### Task 4: Home feed screen

**Files:**
- Create: `mobile/src/features/feed/HomeScreen.tsx`
- Modify: `mobile/src/app/(tabs)/index.tsx` (render `HomeScreen`)
- Test: `mobile/src/features/feed/__tests__/HomeScreen.test.tsx`

**Interfaces:**
- Consumes: `useFeed`, `PostList` (Tasks 2–3), `Tabs`, `EmptyState`, `Button`, `useScrollToTopOnTabPress` (`@/lib/useScrollToTopOnTabPress`).

Behavior and copy (exact):
- `Tabs` at the top of the list header: `Para você` (`general`, default) and `Seguindo` (`following`). Each scope keeps its own query; switching does not refetch an already-loaded scope.
- Floating action button bottom-right above the tab bar: Ionicons `create-outline` on `accent` (56 px circle, `onAccent` icon), label `Publicar`, → `/posts/new`.
- Empty `general`: `EmptyState` `Ainda não há publicações` / `Seja a primeira pessoa a publicar.` / action `Publicar` → `/posts/new`. Empty `following`: `Acompanhe quem joga com você` / `Quando quem você segue publicar ou jogar algo, aparece aqui.` / action `Encontrar pessoas` → `/explore`.
- First-load error: `EmptyState` `Não foi possível carregar o feed` / action `Tentar de novo` → `refetch`. Loading: three `Skeleton` post rows.
- Pull to refresh refetches the current scope; tapping the active Início tab scrolls to top.

- [ ] **Step 1: Write the failing tests** (mock `useFeed`, `expo-router`): default tab `Para você`; switching to `Seguindo` calls `useFeed('following')`; both empty states with their actions; FAB navigates to `/posts/new`; error retry.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add home feed with for-you and following tabs"`

---

### Task 5: Create post screen

**Files:**
- Create: `mobile/src/features/feed/CreatePostScreen.tsx`, `mobile/src/features/feed/GamePickerSheet.tsx`, `mobile/src/app/posts/_layout.tsx`, `mobile/src/app/posts/new.tsx`
- Modify: `mobile/src/features/auth/SessionGate.tsx` (register `<Stack.Screen name="posts" options={{ headerShown: false }} />` inside the signed-in `Stack.Protected`)
- Test: `mobile/src/features/feed/__tests__/CreatePostScreen.test.tsx`

**Interfaces:**
- Consumes: `useCreatePost` (Task 2); `useGameSearch`, `useGame` (`@/features/games/queries`), `gamesApi.byIgdbId`; `useLibrary` (`@/features/library/queries`); `ChoiceChip`, `TextField`, `Button`, `ConfirmDialog`, `showToast`, `usePreventRemove` from `expo-router`.

Behavior and copy (exact):
- Header title `Nova publicação`; header right `Publicar` button (disabled while the trimmed text is empty or longer than 500, or while publishing).
- Multiline `TextField` label `O que você quer compartilhar?`, `maxLength` 500, with a counter `<n>/500` under it.
- Section `Jogo (opcional)`: when no game is linked, a `Vincular um jogo` button opens `GamePickerSheet` (a `Modal` with `TextField` `Buscar jogos`, results from `useGameSearch` as rows with `GameCover` width 36 and name; `Digite pelo menos 2 letras.` under 2 letters). Choosing a result resolves the game with `gamesApi.byIgdbId` (shows `Vinculando ao jogo…`); on failure `Não foi possível vincular ao jogo.` with `Tentar de novo` and `Publicar sem vínculo` (clears the link). When linked, a row with the cover, name and a remove button labelled `Remover vínculo com o jogo`.
- Section `Registro (opcional)` only when linked and the user has records of that game: `ChoiceChip` `Nenhum` (default) plus one chip per record (`<status label> · <platform>`); choosing a record sends its `gameEntryId`.
- Opening with `?igdbId=<n>` (from the game page) pre-links that game.
- Publish: `useCreatePost().mutateAsync({ content, gameId?, gameEntryId? })`, then `showToast('Publicado')` and `router.back()`. API errors show `authErrorMessage(error)` above the text field.
- Leaving with text typed (and not published): `ConfirmDialog` `Descartar publicação?` / `O texto que você escreveu não foi publicado.` / `Descartar` (destructive) / `Continuar editando`.

- [ ] **Step 1: Write the failing tests** (mock queries/API and `expo-router`): 500 characters enables Publicar and 501 cannot be typed (maxLength) — assert the counter; whitespace-only keeps Publicar disabled; publishing sends trimmed content and shows `Publicado`; linking a game via the sheet sends its `gameId`; choosing a record sends `gameEntryId`; `?igdbId=` pre-links; link failure shows both recovery buttons; leaving with text shows the discard dialog.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add create post screen with optional game link"`

---

### Task 6: Post detail with comments

**Files:**
- Create: `mobile/src/features/feed/PostDetailScreen.tsx`, `mobile/src/features/feed/CommentItem.tsx`, `mobile/src/features/feed/CommentComposer.tsx`, `mobile/src/features/feed/flattenComments.ts`, `mobile/src/app/posts/[postId].tsx`
- Test: `mobile/src/features/feed/__tests__/PostDetailScreen.test.tsx`, `mobile/src/features/feed/__tests__/flattenComments.test.ts`

**Interfaces:**
- Consumes: `usePost`, `useComments`, `useAddComment`, `useToggleCommentLike` (Task 2); `PostCard`/`ActivityCard` (Task 3).
- Produces: `flattenComments(roots: Comment[]): { comment: Comment; depth: 0 | 1; replyingTo: UserSummary | null }[]` — each root at depth 0, then all of its descendants depth-first at depth 1, each with `replyingTo` = the author of its direct parent.

Behavior and copy (exact):
- Header title `Atividade` for activity posts, else `Post`.
- The post card at the top (not pressable), then `Comentários (<commentCount>)`.
- Comments: depth-1 items indented by `space.xl` and prefixed `Respondendo a @<username>` in `textMuted`; each item shows `Avatar` 32, display name, relative time, content, a like button (labels `Curtir comentário, <n> curtidas` / `Descurtir comentário, <n> curtidas`) and a `Responder` text button (label `Responder a <displayName>`).
- No comments: `Ainda não há comentários. Seja o primeiro.`
- Composer pinned at the bottom (keyboard-aware: `KeyboardAvoidingView`): `TextField` placeholder `Escreva um comentário` (or `Escreva sua resposta` while replying), `maxLength` 500, send icon button labelled `Enviar comentário` (disabled for trimmed-empty text or while sending). While replying, a bar above it: `Respondendo a @<username>` and `Cancelar resposta`.
- Sending calls `useAddComment(postId).mutateAsync({ content: trimmed, parentCommentId? })`, clears the field and the reply target; errors show `showToast(authErrorMessage(error))` and keep the text.
- Not found (404) or invalid id: `EmptyState` `Post não encontrado` / `Ele pode ter sido removido.` / action `Voltar ao feed` → `/`. Other errors: `Não foi possível carregar o post` / `Tentar de novo`.

- [ ] **Step 1: Write the failing tests** — `flattenComments` with a reply of a reply (depth 1, correct `replyingTo`); screen: comments render with the `Respondendo a` prefix; pressing `Responder` on a reply then sending calls `mutateAsync` with that reply's id; whitespace-only cannot be sent; cancelling the reply clears `parentCommentId`; send error keeps the text and toasts; 404 shows `Post não encontrado`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add post detail with threaded comments"`

---

### Task 7: Posts on the game page

**Files:**
- Modify: `mobile/src/features/games/GameCommunity.tsx` (add the posts section)
- Test: `mobile/src/features/games/__tests__/GameScreen.test.tsx` (extend) or a new `GameCommunityPosts.test.tsx`

**Interfaces:**
- Consumes: `useGamePosts` (Task 2), `PostCard`/`ActivityCard` (Task 3).

Behavior and copy (exact):
- Below `Jogando agora`: section title `Posts` and a `Button` `Publicar sobre este jogo` → `/posts/new?igdbId=<igdbId>`.
- Posts render as cards (pressable → `/posts/<id>`); the game link is hidden on these cards (`PostCard`/`ActivityCard` accept `hideGame?: boolean`).
- The section is inside the game page's `ScrollView`, so it does not use `FlatList`: show the loaded pages and a `Carregar mais` button while `hasNextPage` (calls `fetchNextPage`; spinner while fetching).
- Empty: `Ninguém publicou sobre este jogo` / `Seja a primeira pessoa a contar o que achou.`; error: `Não foi possível carregar os posts` / `Tentar de novo`.

- [ ] **Step 1: Write the failing tests** — section renders posts without game links; `Publicar sobre este jogo` navigates with `igdbId`; `Carregar mais` calls `fetchNextPage` and disappears without a next page; empty state copy.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run all checks** — `npm run typecheck && npm run lint && npm test` in `mobile/` → all exit 0.
- [ ] **Step 5: Verify in the browser** — start `EXPO_PUBLIC_API_URL=https://gt.marcuscoelho.com npx expo start --web --port 8081`, confirm the bundle builds and `/`, `/posts/new` respond without runtime errors in the log, stop the server. No login.
- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): show posts on the game community tab"`
