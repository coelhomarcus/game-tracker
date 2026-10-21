# Dokploy deployment

GameTracker production consists of the backend API running as a Docker service
on Dokploy. The Android client is the Expo app in `mobile/`; its automatic APK
release through GitHub Actions is deferred until an Expo release workflow is
added. There is no production web client.

## Services

Create or keep these Dokploy services in the same project/network:

- the GameTracker backend built from `backend/Dockerfile`;
- PostgreSQL, managed by Dokploy;
- Redis, managed by Dokploy.

The backend connects to PostgreSQL and Redis through their internal Dokploy
service URLs. Do not add PostgreSQL or Redis provisioning to the application or
to the deployment workflow.

## Backend environment

Configure these values in the Dokploy backend service. Use real production
values and keep secrets out of Git:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string from the Dokploy PostgreSQL service |
| `REDIS_URL` | Redis connection string from the Dokploy Redis service |
| `PORT` | API port, normally `3000` |
| `JWT_ACCESS_SECRET` | Strong secret for access tokens |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime, such as `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token lifetime, such as `30d` |
| `IGDB_CLIENT_ID` | IGDB/Twitch client ID |
| `IGDB_CLIENT_SECRET` | IGDB/Twitch client secret |
| `PUBLIC_API_URL` | Public HTTPS URL of the backend |
| `CORS_ORIGINS` | Optional browser origins; native Android clients do not require a browser origin |

The backend listens on the configured `PORT`. Configure Dokploy's public
domain and HTTPS proxy to forward to that port.

## Automatic migrations

The production image starts with:

```text
node dist/db/migrate.js && node dist/server.js
```

This applies the committed Drizzle migrations from `backend/drizzle/` every
time the container starts. The migration process must finish successfully
before the API starts. A migration error intentionally causes the container to
exit so Dokploy does not expose an API with an unknown schema.

Deployments should therefore follow this sequence:

1. Merge the reviewed change from `develop` into `main`.
2. Dokploy builds and deploys the backend image from `backend/Dockerfile`.
3. The container applies pending migrations.
4. The API starts only after migrations succeed.
5. Verify the API health endpoint and application logs in Dokploy.

## Android release configuration

For the future release workflow, GitHub Actions will build the Android APK
against the public Dokploy API. Set the repository variable `API_URL` to the
HTTPS API URL without `/api` at the end. The signing secrets are configured in
GitHub Actions, not in Dokploy. Until that workflow exists, pushes to `main`
publish no APK.
