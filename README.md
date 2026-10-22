# GameTracker

Academic social app for tracking games, sharing activity with friends, and
chatting in real time.

- `mobile/`: Expo (React Native) Android app, in TypeScript.
- `backend/`: Node.js API with Express, Drizzle ORM, PostgreSQL, Redis, and Socket.IO.

The distributed client is the Android APK; there is no web client.

## Features

- Game library (backlog, playing, completed, abandoned) with playthrough history.
- IGDB game search and user search.
- Feed with posts, likes, comments, and follows.
- Profiles, favorites, and profile pictures.
- One-to-one realtime chat, in-app notifications, and Android push support.

## Requirements

- Node.js 22.13+ (or 24.3+, 26+), Docker, and an Android emulator or device.
- IGDB/Twitch credentials for game search.

## Running locally

```bash
# PostgreSQL and Redis
docker compose -f docker-compose.dev.yml up -d

# API on http://localhost:3000
cd backend
cp .env.example .env     # fill in the secrets and IGDB credentials
npm ci
npm run db:migrate
npm run dev

# App
cd mobile
npm ci
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start
```

On the Android emulator the host API is `http://10.0.2.2:3000`. Do not add
`/api` to `EXPO_PUBLIC_API_URL`; the app adds it. Add `--web` for a browser
preview.

Android push notifications need a Firebase `google-services.json`, set through
`android.googleServicesFile` in `mobile/app.json`. Without it the app shows
in-app notifications only.

## Tests

```bash
# Backend (uses disposable services; the database name must end with _test)
cd backend
cp .env.test.example .env.test
npm run test:db:up
npm run typecheck && npm run build && npm test

# App
cd mobile
npm run typecheck && npm run lint && npm test
```

App integration tests run the app's API layer against a local test API. In
`backend/` run `npm run test:seed` and `npm run dev:test`, then:

```bash
cd mobile
GT_BACKEND=http://localhost:3100 npm run test:integration
```

`GT_BACKEND` must be a local origin without a path. Without it the integration
suites are skipped. Never point it at a development or production API.

## Branches and commits

All work happens on `develop`; `main` only receives Pull Requests from
`develop`. Commits follow Conventional Commits
(`<type>(<optional scope>): <description>`, for example `feat(mobile): add
replay tracking`). Mark incompatible changes with `!` or a `BREAKING CHANGE:`
footer.

## Deployment

The backend is deployed from `backend/Dockerfile` to Dokploy, with Dokploy-managed
PostgreSQL and Redis. On start the container applies the committed Drizzle
migrations and then runs the API; if a migration fails, the API does not start:

```text
node dist/db/migrate.js && node dist/server.js
```

Set these variables on the Dokploy backend service (never commit secrets):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `REDIS_URL` | Connection strings of the Dokploy services. |
| `PORT` | API port, normally `3000`. |
| `JWT_ACCESS_SECRET` | Strong secret for access tokens. |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Token lifetimes, such as `15m` and `30d`. |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | IGDB/Twitch credentials. |
| `PUBLIC_API_URL` | Public HTTPS URL of the backend. |
| `CORS_ORIGINS` | Optional browser origins; native clients do not need it. |

## APK releases

Automatic APK releases are deferred: pushes to `main` publish nothing until an
Expo release workflow is added. It will build with `expo prebuild` and Gradle,
take the version from `.github/scripts/next-version.mjs`, keep the
`applicationId` `com.marcuscoelho.gametracker`, and refuse debug-signed APKs.
It will need the repository variable `API_URL` (HTTPS API URL without `/api`)
and the secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.

Create the release keystore once and keep it backed up, since future APKs must
use the same one:

```bash
keytool -genkeypair -v -keystore gametracker-release.jks -alias gametracker \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w 0 gametracker-release.jks    # value for ANDROID_KEYSTORE_BASE64
```
