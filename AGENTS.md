# GameTracker

## Project overview

GameTracker is an academic social game-tracking application. It consists of an
Android client built with Expo (React Native) and a Node.js API. The project is
not commercial and no licensing work is required as part of normal changes.

## Repository structure

- `mobile/`: Expo Android application in TypeScript, using Expo Router, TanStack Query, Zustand, and Socket.IO.
- `mobile/integration/`: Integration suites that run the app's API layer against the disposable test API.
- `backend/`: Express 5 API written in TypeScript, using Drizzle ORM with PostgreSQL and Redis for realtime features.
- `backend/drizzle/`: Database migrations committed to the repository.
- `.github/workflows/`: CI workflows for the backend and the mobile app.
- `.github/scripts/next-version.mjs`: SemVer calculator kept for the future Expo release workflow.
- `docker-compose.dev.yml`: Local PostgreSQL and Redis services.
- `docker-compose.test.yml`: Disposable PostgreSQL and Redis services for tests.

There is no web product to deploy. The distributable client is the Android APK.

## Branch and change policy

- All development changes must be made on `develop`.
- `main` is the production branch and must only be updated through Pull Requests from `develop`.
- Do not commit directly to `main`.
- Keep changes focused and preserve existing tests and behavior unless the task explicitly changes them.
- Do not add license files or commercial licensing changes.

## Local development

Start local infrastructure from the repository root:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Run the backend:

```bash
cd backend
cp .env.example .env
npm ci
npm run db:migrate
npm run dev
```

Run the Expo app:

```bash
cd mobile
npm ci
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start
```

The Android emulator normally reaches the host API through
`http://10.0.2.2:3000`. `EXPO_PUBLIC_API_URL` must not include the `/api`
suffix because the client adds it. Add `--web` for a browser preview.

## Testing and quality checks

Backend checks:

```bash
cd backend
npm run typecheck
npm run build
npm test
```

Mobile checks:

```bash
cd mobile
npm run typecheck
npm run lint
npm test
```

Mobile integration tests run against the local test API. After the backend test
setup described in `README.md` (`.env.test` and the disposable services), start
it with `npm run test:seed` and `npm run dev:test` in `backend/`, then run:

```bash
cd mobile
GT_BACKEND=http://localhost:3100 npm run test:integration
```

Without `GT_BACKEND` the integration suites are skipped. Integration tests use
the disposable test services and must never use a development or production
database or API. See `README.md` for the complete test environment setup.

## Commits and versions

Use Conventional Commits:

```text
<type>(<optional scope>): <imperative description>
```

Common types are `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`,
`ci`, and `chore`. Examples:

```text
feat(mobile): add game replay tracking
fix(backend): reject expired refresh tokens
ci: publish signed Android releases
```

Mark incompatible changes with `!` or a `BREAKING CHANGE:` footer. Releases
use Semantic Versioning, calculated from the commit history:

- breaking changes increment the major version;
- `feat` increments the minor version;
- other changes increment the patch version.

Release tags use the `vX.Y.Z` format. The first release uses the current
`1.0.0` baseline. Automatic releases are currently deferred (see Android
releases below); no release is generated after pushes to `main` for now.

## Dokploy deployment

The backend is deployed to Dokploy from `backend/Dockerfile`. PostgreSQL and
Redis are already provisioned as Dokploy services and must be supplied through
the backend service environment variables; do not add application code to
provision them.

The backend container runs migrations before starting the API:

```text
node dist/db/migrate.js && node dist/server.js
```

If migrations fail, the API must not start. Required production configuration
is documented in `docs/DEPLOY_DOKPLOY.md`. Secrets must be configured in
Dokploy and must never be committed to the repository.

## Android releases

The automatic APK release is deferred: pushes to `main` publish no APK until an
Expo release workflow is added. That workflow will build the APK with
`expo prebuild` and Gradle, compute the version with
`.github/scripts/next-version.mjs`, and keep the same Android `applicationId`
(`com.marcuscoelho.gametracker`) so new APKs update the installed app in place.

For the future release workflow, the repository variable `API_URL` and these
GitHub Actions secrets remain reserved:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The release workflow must refuse to publish an APK signed with the Android
debug key, and must run only for pushes to `main`; Pull Requests run
validation workflows but do not publish releases.

Android push notifications need a Firebase `google-services.json` configured
through `android.googleServicesFile` in `mobile/app.json`; without it the app
shows in-app notifications only.
