# Expo cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Flutter client: port its backend integration tests to the Expo app, swap the CI job, remove `frontend/` and the Flutter workflows, and update the docs.

**Architecture:** A separate Jest project (`mobile/jest.integration.config.js`, node environment) runs the app's real `api.ts` layers and the chat socket against a disposable test API at `GT_BACKEND` (default skip when unset). `backend.yml` replaces `flutter-integration` with `mobile-integration`. The release workflow stays deferred: pushes to `main` publish no APK.

**Tech Stack:** Jest (jest-expo preset in node env), the app's `@/features/*/api.ts`, `socket.io-client`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-20-expo-migration-redesign-design.md` (sub-project 5, "CI and release", "Testing").

## Global Constraints

- All work on `develop`; never push; never publish a release; `main` only via PR.
- Conventional Commits; never name the design-reference products in code, docs or commits.
- Integration tests must never touch a development or production database: they run only against `GT_BACKEND` pointing at the disposable test API (`npm run dev:test`, port 3100, database `gametracker_test`). Without `GT_BACKEND` every integration test is skipped.
- The backend's routes, schema and migrations do not change. Comment-only edits in `backend/scripts/` that mention the Flutter client are allowed.
- `.github/scripts/next-version.mjs` stays: the deferred Expo release workflow will reuse it.
- Do not add license files.

## Review Focus

- `npm test` in `mobile/` must not pick up the integration suite (it would hit the network or fail without `GT_BACKEND`).
- Integration tests that create users must use unique suffixes so reruns against the same test database pass.
- Socket tests must close every socket and timer so Jest exits.
- No local Docker exists on the dev machine: the integration suite is verified locally only in its skip mode and by typecheck; its first real run is CI. Reports must say so.
- Docs must stop telling people to run Flutter, and must say the APK release is deferred.

---

### Task 1: Integration harness, session, library and volume

**Files:**
- Create: `mobile/jest.integration.config.js`, `mobile/integration/backend.ts` (helpers), `mobile/integration/session.test.ts`, `library.test.ts`, `volume.test.ts`
- Modify: `mobile/package.json` (script `test:integration`), `mobile/jest.config.js` (ignore `<rootDir>/integration/`), `mobile/tsconfig.json` if needed so `integration/` typechecks.

**Interfaces:**
- `GT_BACKEND` env var (e.g. `http://localhost:3100`, no `/api`). The harness makes the app's `@/lib/env` resolve `apiBaseUrl = GT_BACKEND + '/api'` (set `EXPO_PUBLIC_API_URL` from `GT_BACKEND` in a setup file before modules load).
- `describeBackend(name, fn)` = `describe` when `GT_BACKEND` is set, else `describe.skip` with one visible skipped test explaining how to run.
- `uniqueSuffix()`, `signUpFresh()` → signed-in session for a new user using the app's real `useSession`/`sessionManager`/`authApi`.
- Behaviors to port (from `frontend/test/integration/backend_session_test.dart`, `backend_library_test.dart`, `backend_volume_test.dart` — read them; each Dart `test(` becomes one Jest `it`): signup/login and envelope errors (409 duplicate, 401 bad password, validation 400); refresh rotation and a reused refresh token rejected; 401 retry through the app client; logout revokes; library CRUD (add entry, change status, playthrough with hours/rating/dates/notes, delete); missing IGDB game is a domain error; synthetic games 900001/900002 from `npm run test:seed`; statistics and players count; another user's entry cannot be edited; volume/pagination cursors return every item exactly once.

- [ ] **Step 1:** Write the harness and the three suites using only the app's public API modules.
- [ ] **Step 2:** `npm run test:integration` without `GT_BACKEND` → all skipped, exit 0. `npm test` → integration not collected. `npm run typecheck && npm run lint` → 0.
- [ ] **Step 3:** Commit — `test(mobile): run the api layer against a real test backend`

### Task 2: Integration — feed, profiles, notifications and push installations

**Files:** Create `mobile/integration/feed.test.ts`, `profiles.test.ts`, `notifications.test.ts`.

**Interfaces:** Task 1 harness. Port every `test(` in `backend_feed_test.dart`, `backend_profiles_test.dart`, `backend_notifications_test.dart` (posts, likes, comments, feed scopes, posts by game incl. missing UUID → empty; profile get/update (204), 404 profile, follow/unfollow counts, avatar/cover upload and replacement URL, non-image rejected; follow notification, mark-all clears counter, no duplicates, 401 without session; push installation register idempotent, revoke twice, non-UUID id rejected). Uploads use a tiny in-memory PNG the same way the app's upload code builds `FormData` (read the app's profile media API to match).

- [ ] **Step 1:** Write the suites. **Step 2:** skip mode exit 0; `npm test`, typecheck, lint → 0. **Step 3:** Commit — `test(mobile): cover feed, profiles and notifications against the test backend`

### Task 3: Integration — chat REST and realtime

**Files:** Create `mobile/integration/chat.test.ts`.

**Interfaces:** Task 1 harness; `chatApi` (`@/features/chat/api`); a direct `socket.io-client` connection per user with `{ auth: { token } }` against `GT_BACKEND` (do not use the app's `chatSocket` singleton — two users need two sockets). Port every `test(` in `backend_chat_test.dart`: create conversation is idempotent per pair; list/messages pagination; `conversation:join` ack; `message:send` ack and `message:receive` to the other member; same `clientMessageId` re-acks the same message without a second event; typing relay; presence get/online/offline; mark read clears unread; server survives invalid ids in socket events. Every socket is disconnected in `afterEach`.

- [ ] **Step 1:** Write the suite. **Step 2:** skip mode exit 0; `npm test`, typecheck, lint → 0. **Step 3:** Commit — `test(mobile): cover chat and realtime against the test backend`

### Task 4: Swap CI, remove the Flutter client, update docs

**Files:**
- Modify: `.github/workflows/backend.yml` — rename `flutter-integration` → `mobile-integration`: drop Java and Flutter setup, add `actions/setup-node` with `cache-dependency-path` for both lockfiles, `npm ci` in `mobile/`, then `GT_BACKEND=http://localhost:3100 npm run test:integration` in `mobile/`; replace `frontend/**` with `mobile/**` in `paths`; update the header comment.
- Delete: `frontend/`, `.github/workflows/flutter.yml`, `.github/workflows/flutter-release.yml`.
- Modify: `AGENTS.md`, `README.md`, `docs/DEPLOY_DOKPLOY.md`, `backend/scripts/seedTestGames.ts` and `devTest.ts` comments that mention Flutter, `mobile/README.md` if it refers to the old client.

**Docs content (decided):**
- Structure: `mobile/` is the Expo Android app (Expo Router, TanStack Query, Zustand, Socket.IO); no `frontend/`.
- Run: `cd mobile && npm ci && EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start` (Android emulator host `http://10.0.2.2:3000`; no `/api` suffix); browser preview with `--web`.
- Checks: `cd mobile && npm run typecheck && npm run lint && npm test`; integration: backend `npm run test:seed` + `npm run dev:test`, then `cd mobile && GT_BACKEND=http://localhost:3100 npm run test:integration`.
- Requirements: drop Flutter; Node 22+, Docker, Android SDK/emulator or device.
- Releases: the automatic APK release is deferred; pushes to `main` publish no APK until an Expo release workflow is added (`expo prebuild` + Gradle, same four signing secrets, `next-version.mjs`, same `applicationId`). Keep the keystore instructions (still needed later) and mark the `API_URL` variable and signing secrets as "for the future release workflow".
- Push: Android push needs a Firebase `google-services.json` (`android.googleServicesFile`); without it the app shows in-app notifications only.
- Commit examples use scope `mobile`.

- [ ] **Step 1:** Edit the workflow; delete the Flutter files; update the docs.
- [ ] **Step 2:** `grep -rn -i "flutter\|frontend/" --exclude-dir=node_modules --exclude-dir=docs/superpowers .` returns only intended mentions (spec/plan history, the migration note). YAML parses (`node -e` with a YAML-free check: `npx --yes yaml@2.6.1 valid .github/workflows/backend.yml` or equivalent). `mobile/` checks still 0.
- [ ] **Step 3:** Commit (two commits) — `ci: run the mobile integration suite instead of the Flutter one` and `chore: remove the Flutter client` (no `!`: the Expo APK updates the installed app in place, and the version bump is the user's call when the release workflow returns).
