# UnReceipt for iPhone (`mobile/`)

The native iPhone app for companies and freelancers, built with Expo (React Native). Accountants use `/firm` on the web. Plan and phases: `docs/plans/unreceipt-ios-native-plan.md`.

It replaces the Capacitor shell (`ios/`, `capacitor.config.ts`, `native/`), which stays in the repo until this app is on TestFlight and is never submitted.

## How it fits together

| Path | What it is |
|---|---|
| `src/app/` | Screens (Expo Router: every file is a route). `sign-in` → `verify` (6-digit email code), then `(app)`: the iOS tab bar with Receipts and Account |
| `src/auth/AuthProvider.tsx` | Sign-in with the same Supabase email code as the website; session in the iPhone Keychain |
| `src/lib/api.ts` | Calls `app.unreceipt.com` with `Authorization: Bearer <access token>` (accepted by `getServerUser()` on the server) |
| `src/lib/HomeProvider.tsx` | The home data: the saved copy at once, then `GET /api/mobile/home` |
| `src/i18n/` | English, Swedish, French. English is the reference; the others must have every key (TypeScript and a test check it) |
| `src/theme.ts` | Tokens from `DESIGN.md` |
| `../src/lib/mobile/types.ts` | The API's JSON types, shared with the server through `import type` only (`@/…` points at the website's `src/`; `~/…` would be the app's own) |

Business rules stay on the server. The app shows what `/api/mobile/*` returns, so the website and the app can't disagree.

## Settings

Three public values: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` (the publishable key, the same one every browser gets). Cloud builds read them from `eas.json`. For `npx expo start` or `expo export` on a computer, put the same three lines in `mobile/.env` (git ignores `.env` files repo-wide). Nothing secret ever goes in the app.

## Checks (run before every commit that touches `mobile/`)

From `mobile/`, after `npm ci` here and at the repository root:

```bash
npm run typecheck
```

```bash
npm test
```

`npm test` uses the website's vitest (`../node_modules`) for the app's plain logic: languages, amounts, dates, list sections. Screens are checked on a phone.

To check that the JavaScript bundles for iOS (no Mac needed):

```bash
EXPO_OFFLINE=1 npx expo export --platform ios --output-dir /tmp/unreceipt-export
```

Add native modules only with `npx expo install <package>` (`EXPO_OFFLINE=1` when api.expo.dev is unreachable): it picks the version that matches the Expo SDK. Never edit `ios/` inside `mobile/`: it is generated from `app.json` at build time and ignored by git.

## Build and send to TestFlight

The iPhone app is compiled in Expo's cloud (EAS Build) and uploaded to App Store Connect (EAS Submit). No Xcode needed.

Once, by the founder:
1. Apple Developer Program (individual is fine for now).
2. A free Expo account, and an access token (expo.dev → Account settings → Access tokens).
3. In App Store Connect, the app "UnReceipt" with bundle ID `com.unreceipt.app`.
4. An App Store Connect API key (Users and Access → Integrations → App Store Connect API, role App Manager), so builds upload without an Apple password.

The token and the key are secrets: they go into the build environment's secret settings, never into git or a chat.

Then each new version is one command from `mobile/`:

```bash
npm run build:testflight
```

The build number goes up by itself (`autoIncrement`). The version the user sees is `version` in `app.json`. The new build shows up in TestFlight after Apple processes it, usually 10 to 30 minutes.

## What to check on every TestFlight build

1. **Start:** the splash (brand icon on cream) fades into the sign-in or the receipts. No white flash.
2. **Sign in:** type the email, then the code. iOS offers the code from Mail above the keyboard. A wrong code shakes and buzzes.
3. **Stay signed in:** swipe the app away, reopen it. You land on Receipts, with the list showing at once.
4. **Receipts:** large title that shrinks when you scroll, "To confirm" first with a honey edge, pull down to refresh, the badge on the tab.
5. **A receipt:** slides in from the right, swipe from the left edge to go back.
6. **Account:** Copy the receipt address (a tick in the hand, "Copied"), sign out asks first.
7. **Offline:** Airplane mode, reopen: the saved list with a "You're offline" note.
8. **Languages:** set the iPhone to Swedish or French (Settings → General → Language): the whole app follows.
9. **Fonts:** titles in the bar and the large title should be Manrope, like the rest. If they look like the iPhone's own font (San Francisco), tell Claude: it's a known risk with fonts loaded at start.
