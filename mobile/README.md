# GameTracker Mobile

React Native client built with Expo, Expo Router and TypeScript.

## Requirements

- Node.js 22 or newer
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

Android emulator (the API defaults to `http://10.0.2.2:3100`):

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
