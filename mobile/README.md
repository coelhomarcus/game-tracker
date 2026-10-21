# GameTracker Mobile

React Native client built with Expo, Expo Router and TypeScript.

## Requirements

- Node.js 22.13+, 24.3+ or 26+
- An Android emulator or device for `npm run android`

## Setup

```bash
npm ci
```

## Running

Browser preview against the production API:

```bash
EXPO_PUBLIC_API_URL=https://gt.marcuscoelho.com npm run web
```

Android emulator (the API defaults to `http://10.0.2.2:3000`):

```bash
npm run android
```

`EXPO_PUBLIC_API_URL` must not include the `/api` suffix because the client adds it.

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

## Integration tests

The suites in `integration/` run the app's API layer against the disposable test API. Start it in
`backend/` with `npm run test:seed` and `npm run dev:test`, then:

```bash
GT_BACKEND=http://localhost:3100 npm run test:integration
```

Without `GT_BACKEND` the suites are skipped. It must be a local origin without a path; never point
it at a development or production API.
