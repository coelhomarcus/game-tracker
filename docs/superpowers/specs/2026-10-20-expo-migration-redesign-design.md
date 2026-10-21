# Expo migration and redesign

Status: draft for review. Date: 2026-10-20.

## Goal

Replace the Flutter Android client with a React Native + Expo client and redesign
the product visually. The backend does not change. The client is a mobile app,
distributed as an Android APK, with a browser preview (`react-native-web`) for
day-to-day development.

## Scope

In scope:

- A new Expo client with the same features the Flutter client has today:
  authentication, library, game search and game page, play records, feed with
  posts and comments, profiles and follow, chat, notifications, push.
- A visual and UX redesign of those features (theme, navigation, cover grid).
- CI and release workflows for the new client.
- Removal of the Flutter client once the new one reaches parity.

Out of scope:

- Backend changes (routes, schema, migrations).
- New product features. "For you" is the existing general feed, not a
  recommendation algorithm.
- A light theme and the theme switcher. The new client is dark only.
- The grid/list toggle in the library. Only the cover grid remains.
- Changing the Android `applicationId` or the signing key.

## Constraints

- All work happens on `develop`; `main` only receives Pull Requests from
  `develop`. The release workflow runs only on pushes to `main`, so `develop`
  may have no working client during the migration. The Pull Request to `main`
  waits until the new client has parity.
- Conventional Commits. Commit messages, specs, plans and code must not name the
  products used as design references; documents call them "design reference".
- The Android `applicationId` stays `com.marcuscoelho.gametracker` and the same
  keystore is used, so the new APK updates the installed app in place.
- The API URL is configured with `EXPO_PUBLIC_API_URL` and must not include the
  `/api` suffix, as `API_URL` does today.

## Stack

| Concern     | Choice                                                         |
| ----------- | -------------------------------------------------------------- |
| Language    | TypeScript, strict                                             |
| Framework   | Expo, React Native, `react-native-web` for the browser preview |
| Navigation  | Expo Router (file-based routes, bottom tabs)                   |
| Server data | TanStack Query                                                 |
| Local state | Zustand (session, preferences)                                 |
| Styling     | `StyleSheet` with typed theme tokens                           |
| Lists       | `FlashList`                                                    |
| Secrets     | `expo-secure-store`, `localStorage` on web                     |
| Realtime    | `socket.io-client` against the existing server                 |
| Push        | `expo-notifications`                                           |
| Tests       | Jest + React Native Testing Library, MSW for the API layer     |
| Release     | `expo prebuild` + Gradle in GitHub Actions                     |

## Structure

```
mobile/                      replaces frontend/ at the end of the migration
  app/                       Expo Router routes; thin screens only
    (auth)/login, register
    (tabs)/index, library, explore, messages, profile
    games/[igdbId], users/[id], posts/[id], me/edit, settings, notifications ...
  src/
    theme/                   tokens.ts: palette, spacing, radii, typography
    components/              design system
    features/<area>/         api.ts, queries.ts, components/, tests
      auth, library, games, feed, profiles, chat, notifications, push
    lib/                     http client, storage, socket, env
```

Rules:

- Screens in `app/` only compose components. Logic lives in `features/`.
- One `features/<area>` per backend domain. `api.ts` holds typed calls,
  `queries.ts` the TanStack Query hooks. Code outside an area imports only its
  public exports.
- Auth keeps the access token in memory and the refresh token in secure storage.
  The HTTP client refreshes once on 401 and retries the request.

## Design system

Tokens (`src/theme/tokens.ts`):

| Token     | Value     | Use                                  |
| --------- | --------- | ------------------------------------ |
| `bg`      | `#16181c` | screen background                    |
| `surface` | `#272c37` | cards, inputs, bars                  |
| `border`  | `#2a2d3c` | cover outline, dividers              |
| `active`  | `#3f4b64` | selected tab or chip, pressed item   |
| `text`    | `#cbd4dc` | primary text                         |
| `accent`  | `#ea377a` | primary actions, links, stars, likes |

Derived tokens: `textMuted`, `textStrong`, and one color per status (playing,
completed, backlog, dropped). Status is always shown with an icon and text,
never color alone.

- Spacing scale: 4, 8, 12, 16, 24, 32. Radii: 6 for covers, 12 for cards and
  inputs.
- Typography: system font, sizes 12, 14, 16, 20, 24. Font scaling stays on and
  layouts tolerate enlarged text.
- Contrast: `text` on `bg` has ample contrast. White text on `accent` is close
  to 4:1, so accent-filled buttons use bold text of 16 pt or larger. Real
  contrast ratios are verified during implementation.

Base components in `src/components/`:

- `GameCover`: 3:4, 1 px border, fallback showing the game name.
- `CoverGrid`: 4 columns on phones, 8 gap, virtualized.
- `CoverFooter`: the pill under a cover. Content follows the sort: date
  (`dd/mm/aa`) for date sorts, `N h` for hours, stars + heart + note icon for
  rating. The slot is reserved even when empty.
- `StatusIcon`: small icon on the cover, shown only when no status tab is
  selected.
- `Tabs` (status tabs), `Pill`, `Avatar`, `Button`, `TextField`, `EmptyState`,
  `Skeleton`.

The cover grid shows only the cover, the optional status icon and the footer.
Title and platform are exposed only in the accessibility label. There is no
per-card menu.

## Navigation and screens

Bottom tabs (the same five destinations as today, reordered):

1. Home: feed with top tabs "For you" (`scope=general`) and "Following"
   (`scope=following`), a floating create-post button, avatar in the header.
2. Library: cover grid, status tabs (All, Playing, Completed, Backlog, Dropped),
   sort (recently added, oldest, most hours, my rating, name A-Z), search and
   platform filter.
3. Explore: game and people search, results in a grid.
4. Messages: conversations and realtime chat.
5. Profile: own profile, collection in the same grid.

The notifications bell stays in the headers. Stack screens: game page (overview,
my progress, community), play record form, post and comments, other user's
profile, edit profile, notifications, settings, login, register. The game page
takes over "View records" and "New record", previously in the per-game menu.

Preserved behavior: tapping the active tab scrolls to top, each tab keeps its
scroll position, the Android back button follows each tab's stack,
pull-to-refresh, skeleton loading, retryable errors. Library filters live in
memory; sort persists on the device.

## Testing

- Jest + React Native Testing Library, written by behavior (what the user sees
  and does).
- The `api.ts` layer is tested with MSW: token refresh, cursor pagination, API
  errors.
- The 63 Flutter tests are a checklist of behaviors to cover, not code to port.
  Each sub-project covers the equivalent behaviors before the old code is
  removed.
- Quality checks: `tsc --noEmit`, `eslint`, `jest`.

## CI and release

- `flutter.yml` becomes `mobile.yml` (typecheck, lint, tests) on push and Pull
  Request. The Flutter workflow is removed with `frontend/`.
- Release is deferred. `flutter-release.yml` builds the Flutter client, so it
  is removed with `frontend/`; until an Expo release workflow is added later
  (`expo prebuild`, Gradle `assembleRelease`, the existing four signing
  secrets, version from `next-version.mjs`, build number from the run number,
  refusal to publish a debug-signed APK), pushes to `main` publish no APK.
- The backend workflow is unchanged. The `flutter-integration` job is
  re-evaluated in the last sub-project: its equivalent runs the app's `api.ts`
  layer against a real backend.

## Sub-projects and order

Each sub-project gets its own plan and implementation cycle.

1. Foundation: Expo project, theme and tokens, base components, tabs, HTTP client
   with refresh, auth and session, validation CI.
2. Library and games: cover grid, status tabs, sorts, game page, record form.
3. Social: feed, posts and comments, likes, profiles, follow, notifications.
4. Chat and push: conversations, Socket.IO, read state, `expo-notifications`.
5. Cleanup: remove `frontend/`, update `AGENTS.md`, `README.md` and `docs/`.
   The signed APK release workflow is deferred: it is not part of this
   migration for now.

Only the Foundation blocks the others; 2, 3 and 4 can be reordered.

## Risks

- The Flutter client stays in the repository until sub-project 5, so two clients
  coexist on `develop`. Their workflows are independent.
- Secure storage and push behave differently on web; the browser preview covers
  UI work, and push and Android-specific behavior are verified on a device or
  emulator.
- Dropping the light theme and the grid/list toggle removes behavior that exists
  today; both removals are deliberate.
