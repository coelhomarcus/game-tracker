# GameTracker

## Project overview

GameTracker is an academic social game-tracking application. It consists of an
Android Flutter client and a Node.js API. The project is not commercial and no
licensing work is required as part of normal changes.

## Repository structure

- `frontend/`: Flutter Android application using Riverpod, go_router, Dio, and Socket.IO.
- `backend/`: Express 5 API written in TypeScript, using Drizzle ORM with PostgreSQL and Redis for realtime features.
- `backend/drizzle/`: Database migrations committed to the repository.
- `.github/workflows/`: CI and automatic Android release workflows.
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

Run the Flutter app:

```bash
cd frontend
flutter pub get
flutter run --dart-define=API_URL=http://localhost:3000
```

The Android emulator normally reaches the host API through
`http://10.0.2.2:3000`. The API URL must not include the `/api` suffix because
the client adds it.

## Testing and quality checks

Backend checks:

```bash
cd backend
npm run typecheck
npm run build
npm test
```

Flutter checks:

```bash
cd frontend
flutter pub get
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
```

Integration tests use the disposable test services and must never use a
development or production database. See `README.md` for the complete test
environment setup.

## Commits and versions

Use Conventional Commits:

```text
<type>(<optional scope>): <imperative description>
```

Common types are `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`,
`ci`, and `chore`. Examples:

```text
feat(frontend): add game replay tracking
fix(backend): reject expired refresh tokens
ci: publish signed Android releases
```

Mark incompatible changes with `!` or a `BREAKING CHANGE:` footer. Releases
use Semantic Versioning and are generated automatically after pushes to
`main`:

- breaking changes increment the major version;
- `feat` increments the minor version;
- other changes increment the patch version.

Release tags use the `vX.Y.Z` format. The first release uses the current
`1.0.0` baseline. The Android build name is taken from the release version and
the Android build number is taken from the GitHub Actions run number.

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

The automatic release workflow requires the repository variable `API_URL` and
these GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The workflow refuses to publish an APK signed with the Android debug key. The
release workflow runs only for pushes to `main`; Pull Requests run validation
workflows but do not publish releases.
