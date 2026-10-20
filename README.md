# GameTracker

GameTracker is an academic social Android app for tracking games, sharing
activity with friends, and chatting in real time. The project has two parts:

- a Flutter Android client in `frontend/`;
- a Node.js/Express API in `backend/`.

There is no production web frontend. The distributed client is the Android APK.

## Features

- Game library with backlog, playing, completed, and abandoned statuses.
- Playthrough history with hours, rating, platform, dates, and private notes.
- IGDB game search and user search.
- Community feed, posts, likes, comments, and follows.
- User profiles, favorites, profile pictures, and cover images.
- One-to-one realtime chat with presence and reconnection.
- In-app notifications and Android push-notification support.

## Project structure

| Path | Description |
| --- | --- |
| `frontend/` | Flutter Android app using Riverpod, go_router, Dio, and Socket.IO. |
| `backend/` | TypeScript API using Express, Drizzle ORM, PostgreSQL, Redis, JWT, and Socket.IO. |
| `backend/drizzle/` | Committed database migrations. |
| `.github/workflows/` | Backend CI, Flutter CI, and automatic APK releases. |
| `docs/DEPLOY_DOKPLOY.md` | Production deployment notes for Dokploy. |
| `docker-compose.dev.yml` | Local PostgreSQL and Redis services. |
| `docker-compose.test.yml` | Disposable PostgreSQL and Redis services for tests. |

## Requirements

- Node.js 22 or newer.
- Docker and Docker Compose.
- Flutter 3.47.6 and the Android SDK for APK builds.
- IGDB/Twitch Developer credentials for game search.

## Local development

### Start PostgreSQL and Redis

From the repository root:

```bash
docker compose -f docker-compose.dev.yml up -d
```

### Start the backend

```bash
cd backend
cp .env.example .env
npm ci
npm run db:migrate
npm run dev
```

The local API listens on `http://localhost:3000` by default. Configure the
following values in `backend/.env` as needed:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL` | Redis connection string. |
| `JWT_ACCESS_SECRET` | Secret used to sign access tokens. |
| `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` | Credentials for IGDB game search. |
| `PUBLIC_API_URL` | Public API URL used in generated image and upload URLs. |
| `CORS_ORIGINS` | Comma-separated browser origins for production. |

### Run the Android app

```bash
cd frontend
flutter pub get
flutter run --dart-define=API_URL=http://localhost:3000
```

For an Android emulator, use `http://10.0.2.2:3000` as the API host. Do not add
`/api` to `API_URL`; the client adds that path itself.

## Tests

### Backend tests

Backend tests require the disposable test services and a test environment file:

```bash
cd backend
cp .env.test.example .env.test
npm run test:db:up
npm test
```

The test database must end with `_test`. The test safety guard rejects remote
databases and development databases.

### Flutter tests

```bash
cd frontend
flutter pub get
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
```

Flutter integration tests run against a real local test API. Start the backend
test API first:

```bash
cd backend
npm run test:seed
npm run dev:test
```

Then, in another terminal:

```bash
cd frontend
flutter test test/integration --dart-define=GT_BACKEND=http://localhost:3100
```

## Branches and commits

- Make all development changes on `develop`.
- Update `main` through Pull Requests from `develop`.
- Do not commit directly to `main`.

Use Conventional Commits:

```text
<type>(<optional scope>): <imperative description>
```

Examples:

```text
feat(frontend): add replay tracking
fix(backend): reject expired refresh tokens
ci: publish signed Android releases
```

Use `!` or a `BREAKING CHANGE:` footer for incompatible changes.

## Automatic APK releases

Every push to `main` runs `.github/workflows/flutter-release.yml`. Pull
Requests run validation workflows but do not publish releases.

The release workflow:

1. runs the Flutter quality gate;
2. calculates the next SemVer version from Conventional Commits;
3. builds a signed APK;
4. creates a `vX.Y.Z` Git tag;
5. creates a GitHub Release with the APK attached.

The first release uses version `1.0.0`. Later releases increment the major,
minor, or patch number according to the commit history. APK files are named
`gametracker-X.Y.Z.apk`.

For a local release build:

```bash
cd frontend
API_URL=https://api.example.com tool/build_release.sh
```

The local build requires `frontend/android/key.properties` and a real release
keystore. Debug-signed APKs are rejected.

## Dokploy deployment

The backend is deployed from `backend/Dockerfile` to Dokploy. PostgreSQL and
Redis are existing Dokploy-managed services; the application does not create
or provision them.

The container automatically applies Drizzle migrations before starting the API:

```text
node dist/db/migrate.js && node dist/server.js
```

If a migration fails, the API does not start. See
[`docs/DEPLOY_DOKPLOY.md`](docs/DEPLOY_DOKPLOY.md) for the production variables
and deployment sequence.

## Manual configuration checklist

The repository changes cannot configure external GitHub or Dokploy settings.
Complete these steps once:

1. Create or verify the `develop` branch on GitHub.
2. Protect `main` and require Pull Requests from `develop`.
3. Add the GitHub Actions repository variable `API_URL`, containing the HTTPS
   Dokploy API URL without `/api`.
4. Add these GitHub Actions secrets:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
5. Configure the Dokploy backend environment variables listed in
   `docs/DEPLOY_DOKPLOY.md`.
6. Confirm that the Dokploy backend can reach its PostgreSQL and Redis services.

The Android keystore is the signing key for distributed APKs. Keep the
keystore file and all passwords private; never commit them to Git.

### Create the release keystore manually

Run this once on a secure machine. Keep the generated `.jks` file in a secure
backup because future APK updates must use the same keystore:

```bash
keytool -genkeypair -v \
  -keystore gametracker-release.jks \
  -alias gametracker \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then encode it and add the result as the `ANDROID_KEYSTORE_BASE64` repository
secret. On macOS or Linux:

```bash
base64 < gametracker-release.jks | tr -d '\n' | pbcopy   # macOS
base64 -w 0 gametracker-release.jks                     # Linux
```

Add the keystore password, alias, and key password as the other three secrets.
The workflow recreates the temporary keystore on the runner and deletes it
after the build.
