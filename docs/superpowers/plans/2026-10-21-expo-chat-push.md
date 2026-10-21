# Expo Chat and Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Mensagens placeholder with realtime chat (conversation list, chat room, typing and presence, reliable sending), start conversations from profiles, and add the push layer with `expo-notifications`.

**Architecture:** REST for lists and history (`src/features/chat/api.ts` + TanStack Query), one Socket.IO connection for live events (`src/lib/realtime/chatSocket.ts`) owned by the session, and a small chat store for outgoing messages, drafts, typing and presence. Messages are deduplicated by `id` and `clientMessageId`, so retries and echoes never duplicate. The push layer sits behind a `PushPlatform` boundary like the Flutter client; it is only active when the Android build has a Firebase config file, otherwise Settings says push is unavailable (the Flutter client never had a Firebase project either).

**Tech Stack:** Expo SDK 58, Expo Router, TypeScript strict, TanStack Query v5, Zustand, `socket.io-client`, `expo-notifications`, Jest + RNTL 14, MSW.

**Spec:** `docs/superpowers/specs/2026-10-20-expo-migration-redesign-design.md` (sub-project 4, "Chat and push").

## Global Constraints

- All work on `develop`. Never push. Conventional Commits with scope `mobile`. Commit messages, code, comments and docs never name the products used as design references.
- Routes live in `mobile/src/app/`; new route groups are registered once in `SessionGate`'s signed-in `Stack.Protected`. RNTL 14 is async. Single-quote style.
- Theme tokens only; dark only; `textMuted` never on `active`; interactive targets ≥ 48 dp. Never white text on `accent` below bold 16.
- User-facing copy is Brazilian Portuguese, exactly as written in this plan. Display name = `name` when non-blank, else `username`.
- Backend unchanged. REST: `GET /conversations` → `[{ id, otherUser: UserSummary | null, lastMessage: Message | null, unread: boolean }]` (newest first); `POST /conversations` body `{ userId }` → 201 `{ id }` (find or create); `GET /conversations/:id/messages?cursor=&limit=30` → `{ items: Message[] (newest first), nextCursor }`; `POST /conversations/:id/read` → 204. `Message = { id, conversationId, senderId, content, createdAt, clientMessageId?, sender: UserSummary }`. Push: `PUT /push/installations/:installationId` (uuid) body `{ provider: 'fcm', platform: 'android', token }`; `DELETE /push/installations/:installationId`.
- Socket.IO server at the API origin (`apiOrigin`, default path `/socket.io`), auth `{ token: <access token> }`; connect errors with message `unauthorized` mean the access token was rejected. Client → server: `conversation:join { conversationId }` (ack `{ ok: true }` | `{ error }`), `conversation:leave { conversationId }`, `message:send { conversationId, content (1–2000, trimmed), clientMessageId (uuid) }` (ack `{ message }` | `{ error }`; idempotent per `clientMessageId`), `typing:start|typing:stop { conversationId }` (only after joining), `presence:get { conversationId }` (ack `{ online: string[] }`). Server → client: `message:receive Message`, `typing:start|typing:stop { conversationId, userId }`, `presence:online|presence:offline { userId }`. Push data for messages: `{ type: 'message', recipientId, conversationId, messageId }`.
- The Flutter client (`frontend/lib/features/chat/`, `frontend/lib/core/realtime/chat_connection.dart`, `frontend/lib/features/push/`) is the behavioral reference; `frontend/` and `backend/` are not modified.

## Review Focus

1. Sending while offline or when the ack is lost: the message shows `Enviando…`, then `Confirmando…`, and is re-sent with the same `clientMessageId` on reconnect, so it appears exactly once even if the server had already stored it (test in Task 3).
2. The access token expires while the app is open: the socket reconnects after one refresh instead of looping on `unauthorized`; signing out stops the socket and clears drafts, pending messages and chat caches (test in Task 2).
3. A message arriving for a conversation that is not open updates the list (last message, unread, order) without opening it; one arriving for the open conversation is appended once and marks it read (test in Task 3).
4. Scrolling up loads older messages once per page; reaching the beginning shows `Início da conversa` (test in Task 5).
5. On a build without push configuration, nothing tries to register a token and Settings explains push is unavailable (test in Task 7).

---

### Task 1: Chat API and types

**Files:**
- Create: `mobile/src/features/chat/types.ts`, `mobile/src/features/chat/api.ts`, `mobile/src/lib/uuid.ts`
- Test: `mobile/src/features/chat/__tests__/api.test.ts` (node env + MSW), `mobile/src/lib/__tests__/uuid.test.ts`

**Interfaces:**
- `Message { id; conversationId; senderId; content; createdAt: Date; clientMessageId: string | null; sender: UserSummary }`; `Conversation { id; otherUser: UserSummary | null; lastMessage: Message | null; unread: boolean }`; `MessagePage { items: Message[]; nextCursor: string | null }`; parsers.
- `chatApi.list()`, `create(userId)` → `string` (the id), `messages(conversationId, cursor?)` (limit 30), `markRead(conversationId)`.
- `newUuid(): string` — RFC 4122 v4 (`crypto.randomUUID` when available, else random bytes via `crypto.getRandomValues`, else `Math.random` fallback); matches `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.

- [ ] **Step 1: Write the failing tests** — parsing (null `otherUser`/`lastMessage`, missing `clientMessageId` → null); `messages` sends `limit=30` and `cursor` only when given; `create` returns the id; `markRead` POST; `newUuid` format and uniqueness over 1 000 calls.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add chat API client and uuid helper"`

---

### Task 2: Realtime connection

**Files:**
- Create: `mobile/src/lib/realtime/chatSocket.ts`, `mobile/src/lib/realtime/connectionStore.ts`
- Modify: `mobile/src/features/auth/SessionGate.tsx` (start the connection while signed in; stop on sign-out)
- Test: `mobile/src/lib/realtime/__tests__/chatSocket.test.ts` (mock `socket.io-client` with a fake socket that records `emit`s and lets the test fire events)

**Interfaces:**
- `npm i socket.io-client`.
- `useChatConnection` (Zustand): `{ status: 'stopped' | 'connecting' | 'connected' | 'waiting'; attempt: number }`.
- `chatSocket.start()`, `stop()`, `reconnectNow()`, `emitWithAck<T>(event, payload, timeoutMs = 10_000): Promise<T>` (rejects with `Error('timeout')` / `Error('disconnected')`), `on(event, handler): () => void` (unsubscribe), `onConnected(handler): () => void` (fires on every (re)connect — used to re-join rooms and flush pending messages).
- Connects to `apiOrigin` with `transports: ['websocket']`, `autoConnect: false`, `reconnection: false` (we own retries), `auth: { token: sessionManager.accessToken }` set before each attempt.
- Backoff between failed attempts: 1 s, 2 s, 5 s, 10 s, then 30 s (status `waiting`); a drop after being connected retries immediately once.
- `connect_error` with message `unauthorized` → `sessionManager.refreshAfterUnauthorized(usedToken)`: `refreshed` → retry immediately with the new token; `invalid` → stop (the session ends through `onExpired`); otherwise back off.
- `AppState` becoming `active` while `waiting` → `reconnectNow()`.

- [ ] **Step 1: Write the failing tests** — start connects with the current token; backoff sequence on repeated failures (fake timers); `unauthorized` triggers exactly one refresh and reconnects with the new token; `invalid` stops; drop after connected retries immediately; `emitWithAck` resolves on ack and rejects on timeout; stop disconnects and sets `stopped`; SessionGate starts on sign-in and stops on sign-out.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add the realtime chat connection"`

---

### Task 3: Chat store, queries and reliable sending

**Files:**
- Create: `mobile/src/features/chat/queries.ts`, `mobile/src/features/chat/chatStore.ts`, `mobile/src/features/chat/mergeMessages.ts`, `mobile/src/features/chat/realtimeBridge.ts`
- Test: `mobile/src/features/chat/__tests__/mergeMessages.test.ts`, `chatStore.test.ts`, `queries.test.tsx`, `realtimeBridge.test.ts`

**Interfaces:**
- Keys `['conversations']`, `['messages', conversationId]` (infinite, newest page first).
- `useConversations()`, `useMessages(conversationId)`, `useStartConversation()` → `mutateAsync(userId)` → id (invalidates `['conversations']`), `useMarkRead(conversationId)`.
- `mergeMessages(server: Message[], incoming: Message[]): Message[]` — dedupe by `id`, and by `clientMessageId` when present; sorted newest first by `createdAt`, then `id`.
- `useChatStore` (Zustand, memory only, cleared when `useSession` becomes `signedOut`): `pending: Record<conversationId, PendingMessage[]>` with `PendingMessage { clientMessageId; content; createdAt: Date; status: 'sending' | 'uncertain' | 'failed'; error?: string }`; `drafts: Record<conversationId, string>`; `typing: Record<conversationId, boolean>`; `online: Record<userId, boolean>`; `openConversationId: string | null`; actions `setDraft`, `send(conversationId, text)`, `retry(conversationId, clientMessageId)`, `discard(conversationId, clientMessageId)`, `draftCount()`.
- `send`: trims; adds a `sending` pending message with `newUuid()`; `emitWithAck('message:send', …)`; on `{ message }` → remove pending and merge the message into `['messages', id]` and the conversation list; on `{ error }` → `failed` with the error; on timeout/disconnect → `uncertain`. On every reconnect, `uncertain` and `sending` messages are re-sent with the same `clientMessageId`.
- `realtimeBridge` (started with the connection): `message:receive` → merge into `['messages', id]` if cached, update the `['conversations']` entry (lastMessage, move to top, `unread: true` unless it is the open conversation or the sender is me; refetch the list when the conversation is unknown); for the open conversation, call `chatApi.markRead`. `typing:start/stop` → `typing[conversationId]` (auto-clear after 6 s without a stop). `presence:online/offline` → `online[userId]`. On reconnect, re-join the open conversation and refresh its presence with `presence:get`.

- [ ] **Step 1: Write the failing tests** — merge dedupes echo vs. ack by `clientMessageId`; send success replaces pending with the server message exactly once even if `message:receive` arrives first; ack error → failed; timeout → uncertain then re-sent on reconnect with the same id; retry/discard; message for a closed conversation updates the list and unread; for the open conversation it appends once and marks read; typing auto-clears; sign-out clears the store.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add chat state with reliable sending and live updates"`

---

### Task 4: Conversation list (Mensagens tab)

**Files:**
- Create: `mobile/src/features/chat/ConversationsScreen.tsx`, `mobile/src/features/chat/ConversationRow.tsx`, `mobile/src/features/chat/NewConversationSheet.tsx`
- Modify: `mobile/src/app/(tabs)/messages.tsx`; `(tabs)/_layout.tsx` (Mensagens header right: `Nova conversa` icon button, Ionicons `create-outline`); the Mensagens tab icon shows a small `accent` dot when any conversation is unread
- Test: `mobile/src/features/chat/__tests__/ConversationsScreen.test.tsx`

**Behavior and copy (exact):**
- `TextField` `Buscar conversas` (filters by display name or username, folded with `foldText`); `Tabs` `Todas (<n>)` / `Não lidas (<n>)`.
- Row: `Avatar` 48, display name (`Conversa` when `otherUser` is null), preview `Você: <content>` for my last message or `<content>`, `Nenhuma mensagem` when none (1 line), relative time, unread rows bold with an `accent` dot; label `<name>, <Não lida, ><preview>, <time>`; press → `/chat/<id>`.
- Empty: `Nenhuma conversa ainda` / `Converse com quem você encontrar na comunidade.` / action `Nova conversa`; search empty: `Nenhuma conversa encontrada` / `Tente outro nome ou limpe a busca.` / action `Limpar busca`; error without data: `Não foi possível carregar as conversas` / `Tentar de novo`; pull to refresh.
- `NewConversationSheet`: a `Modal` titled `Nova conversa` with `PeopleSearch`-like search (reuse `usePeopleSearch` and `PersonRow` without the follow button); choosing a person → `useStartConversation` → `/chat/<id>`; failure → toast `authErrorMessage(error)`.

- [ ] **Step 1: Write the failing tests** — rows/previews/unread label, search filter, unread tab count, empty and search-empty states, new conversation flow navigates to `/chat/<id>`.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add the conversation list"`

---

### Task 5: Chat room

**Files:**
- Create: `mobile/src/features/chat/ChatRoomScreen.tsx`, `mobile/src/features/chat/MessageBubble.tsx`, `mobile/src/features/chat/ChatComposer.tsx`, `mobile/src/features/chat/ConnectionBanner.tsx`, `mobile/src/app/chat/_layout.tsx`, `mobile/src/app/chat/[conversationId].tsx`
- Modify: `SessionGate` (register `chat`)
- Test: `mobile/src/features/chat/__tests__/ChatRoomScreen.test.tsx`

**Behavior and copy (exact):**
- Header: `Avatar` 32 + display name (pressable → `/users/<id>`, label `Perfil de <name><, status>`), subtitle `digitando…` while typing, else `online` when present. Invalid id (non-UUID) or 404 → `EmptyState` `Conversa não encontrada` / action `Voltar`.
- On open: set `openConversationId`, `conversation:join`, `presence:get`, `markRead`, and mark the list entry read; on close: `conversation:leave`, clear `openConversationId`.
- Messages in an inverted `FlatList` (newest at the bottom) merging server pages and pending messages; day separators `Hoje`, `Ontem`, else `dd/mm/aaaa`; reaching the top fetches the next page once (`hasNextPage && !isFetchingNextPage && !isFetchNextPageError`); older-page error `Não foi possível carregar mensagens mais antigas.` + `Tentar de novo`; no more pages → `Início da conversa`.
- Bubble: mine aligned right on `active` with `textStrong`; others left on `surface` with `text`; time `HH:mm` under each; label `<Você|name>: <content>, <time>`; pending status lines `Enviando…` (Ionicons `time-outline`), `Confirmando…` (`sync-outline`), failed `Não enviada` in `danger` with `Tentar de novo` and `Descartar`.
- Empty conversation: `Diga oi para <name>` / `As mensagens aparecem aqui.`
- Composer: `TextField` placeholder `Mensagem` (label hidden), multiline up to 5 lines, `maxLength` 2000, draft persisted in `drafts`; send icon button (Ionicons `send`) label `Enviar mensagem`, disabled for trimmed-empty text; typing: emit `typing:start` on the first keystroke and `typing:stop` after 3 s idle, on send and on leave.
- `ConnectionBanner` above the composer when status is not `connected`: `Conectando…` while connecting; `Sem conexão. As mensagens saem quando voltar.` while waiting, with `Tentar agora` → `reconnectNow()`.
- When a new message arrives while the user is scrolled away from the bottom, a pill `Novas mensagens` appears; pressing it scrolls to the newest.

- [ ] **Step 1: Write the failing tests** — join/leave and markRead on open; pages load once at the top and `Início da conversa` at the end; day separators; bubble labels; pending statuses and retry/discard; empty copy; typing emits start/stop with fake timers; banner states; `Novas mensagens` pill; invalid id.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add the chat room"`

---

### Task 6: Start a conversation from a profile, and drafts on sign-out

**Files:**
- Modify: `mobile/src/features/profiles/ProfileScreen.tsx` (other users: `Button` `Mensagem` (secondary) next to `FollowButton` → `useStartConversation` → `/chat/<id>`; disabled while starting; error toast), `mobile/src/features/profiles/SettingsScreen.tsx` (sign-out confirm message when there are unsent drafts or pending messages: `Você tem uma mensagem escrita e não enviada. Ela será descartada.` / `Você tem <n> mensagens escritas e não enviadas. Elas serão descartadas.`)
- Test: extend `ProfileScreen.test.tsx`, `SettingsScreen.test.tsx`

- [ ] **Step 1: Write the failing tests** — `Mensagem` only on other profiles and navigates to `/chat/<id>`; sign-out dialog messages for 0, 1 and 3 drafts.
- [ ] **Step 2–4: fail, implement, pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): message people from profiles and warn about unsent drafts"`

---

### Task 7: Push notifications layer

**Files:**
- Create: `mobile/src/features/push/pushPlatform.ts`, `mobile/src/features/push/pushController.ts`, `mobile/src/features/push/api.ts`
- Modify: `mobile/app.json` (`expo-notifications` plugin), `mobile/src/app/_layout.tsx` or `SessionGate` (start the controller while signed in), `SettingsScreen.tsx` (section `Notificações`)
- Test: `mobile/src/features/push/__tests__/pushController.test.ts`, extend `SettingsScreen.test.tsx`

**Interfaces and behavior:**
- `npx expo install expo-notifications`.
- `PushPlatform`: `supported` = `Platform.OS === 'android' && Boolean(Constants.expoConfig?.android?.googleServicesFile)`; `permission()`, `requestPermission()`, `token()` (`getDevicePushTokenAsync().data`), `onTokenRefresh(handler)`, `onOpened(handler)` (response listener), `initialMessage()` (`getLastNotificationResponseAsync`).
- `pushApi.register(installationId, token)` (PUT, `{ provider: 'fcm', platform: 'android', token }`), `revoke(installationId)`.
- `usePush` (Zustand): `status: 'unsupported' | 'off' | 'registering' | 'on' | 'denied' | 'failed'`; `enable()` (request permission → token → register); on sign-in with permission already granted it registers silently; token refresh re-registers; sign-out revokes (best effort) before the session clears; installation id generated once with `newUuid()` and stored in AsyncStorage `push.installationId`.
- Tapping a notification: `data.type === 'message'` with `conversationId` → `/chat/<conversationId>`; any other → `/notifications`; while signed out the route is kept and opened after sign-in.
- Settings `Notificações` section copy (exact): unsupported → `As notificações aparecem na central com o app aberto. Avisos com o app fechado não estão disponíveis nesta versão.`; `on` → `Ativadas neste aparelho.`; `registering` → `Ativando…`; `off` → `Desativadas neste aparelho.` + `Button` `Ativar`; `denied` → `Bloqueadas nas configurações do sistema. Libere por lá para receber avisos.` + `Tentar de novo`; `failed` → `Não foi possível ativar agora. Tente de novo.` + `Tentar de novo`; plus a `Button` `Abrir central de notificações` → `/notifications`.

- [ ] **Step 1: Write the failing tests** (mock `expo-notifications`, `expo-constants`, AsyncStorage) — unsupported does nothing and Settings shows the unavailable copy; enable registers with the stored installation id; denied state; token refresh re-registers; sign-out revokes; tap routing for message and other types; pending route after sign-in.
- [ ] **Step 2–3: fail, implement.**
- [ ] **Step 4: Run all checks** — `npm run typecheck && npm run lint && npm test` → all exit 0.
- [ ] **Step 5: Verify in the browser** — start `EXPO_PUBLIC_API_URL=https://gt.marcuscoelho.com npx expo start --web --port 8081`, confirm the bundle builds and `/messages` and `/settings` respond without runtime errors, stop the server. No login.
- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): add the push notifications layer"`
