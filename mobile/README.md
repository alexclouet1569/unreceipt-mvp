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
| `src/lib/AccountProvider.tsx` | The Account tab's data: the saved copy, then `GET /api/mobile/account` |
| `src/app/(app)/account/` | Export, currency, your accountant, delete account, and the forwarding guide (`GET /api/mobile/forwarding`) |
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

The first time only, link the app to the Expo account (it writes the project id into `app.json`; commit that change):

```bash
npx eas-cli@latest init
```

Then each new version is one command from `mobile/`:

```bash
npm run build:testflight
```

The build number goes up by itself (`autoIncrement`). The version the user sees is `version` in `app.json`. The new build shows up in TestFlight after Apple processes it, usually 10 to 30 minutes.

## Releases: updates and builds

Two ways a new version reaches the iPhone:

- **Over-the-air update (most changes).** Screens, text, logic and images are JavaScript and assets: `expo-updates` downloads them from Expo (channel `production`) without a new build or Apple's processing. The app checks at every start and when it comes back to the front (`src/lib/useAppUpdates.ts`); it switches to the new version at the next cold start, or at once when it comes back after more than 5 minutes away. Never in the middle of something.
- **A new build (native changes).** A new native module (`npx expo install`), a permission, a plugin or an `app.json` setting changes the app's *fingerprint* (`runtimeVersion` policy `fingerprint`). An update only reaches builds with the same fingerprint, so these need a build and a TestFlight round.

Both happen by themselves: `.eas/workflows/deploy-to-production.yml` runs on every merge to `main` that touches the app. It computes the fingerprint; if a build with it exists, it publishes an update; if not, it builds and sends the build to TestFlight. That needs, once, the repository connected on expo.dev → project **unreceipt** → **GitHub** (install the Expo GitHub app, pick `alexclouet1569/unreceipt-mvp`, **Base directory** `mobile`). The update job sets the three public `EXPO_PUBLIC_*` values itself: an update is bundled outside a build and doesn't read `eas.json`'s build env.

By hand, from `mobile/` (signed in once with `npx eas-cli@latest login`): `npx eas-cli@latest update --channel production --platform ios --message "…"` for an update (with the three `EXPO_PUBLIC_*` values set), or `npm run build:testflight` for a build. Apple allows updates that fix and improve the app; never use one to change what the app is for (App Store 2.5.2), and never to show anything about prices.

## What to check on every TestFlight build

1. **Start:** the splash (brand icon on cream) fades into the sign-in or the receipts. No white flash.
2. **Sign in:** type the email, then the code. iOS offers the code from Mail above the keyboard. A wrong code shakes and buzzes.
3. **Stay signed in:** swipe the app away, reopen it. You land on Receipts, with the list showing at once.
4. **Receipts:** large title that shrinks when you scroll, "To confirm" first with a honey edge, pull down to refresh, the badge on the tab.
5. **A receipt:** slides in from the right, swipe from the left edge to go back.
6. **Account:** Copy the receipt address (a tick in the hand, "Copied"), sign out asks first.
7. **Offline:** Airplane mode, reopen: the saved list with a "You're offline" note.
8. **Languages:** set the iPhone to Swedish or French (Settings → General → Language): the whole app follows.
9. **Scan:** tap the green button. Apple's scanner opens, finds the receipt's edges and takes it by itself; scan two or three receipts in a row, then Save. Each shows at once with its picture and "Reading your receipt…", then turns into the receipt (a tick in the hand). Touch and hold the button (or the photo icon at the top) to pick photos instead. The first time, iOS asks for the camera with UnReceipt's sentence.
10. **Offline scan:** Airplane mode, scan a receipt: it says it's waiting and saved on the iPhone. Airplane mode off, back in the app: it's read.
11. **Confirm:** open a receipt "To confirm", tap the amount, the date or the category to change it in the bottom sheet, then **Confirm receipt**. It leaves the "To confirm" section and the badge goes down.
12. **Missing fields:** a receipt with a missing amount shows "Add" in red and a button "Add amount" that opens the right sheet.
13. **Delete:** swipe a receipt left, tap Delete: it disappears, "Deleted …" with Undo for 5 seconds. Try Undo once.
14. **Photo:** a scanned receipt shows its photo on top; tap it, pinch and double-tap to zoom, swipe down to close.
15. **Fonts:** titles in the bar and the large title should be Manrope, like the rest. If they look like the iPhone's own font (San Francisco), tell Claude: it's a known risk with fonts loaded at start.
16. **Receipts header (like the website):** the UnReceipt logo in the bar, the mint pilot box (the × hides it), "Your receipts" with your email, three boxes (Receipts, Verified, this month's total: tap it for another month or All time), By date / By category, and the chips All, To confirm, then categories (tap the active one again for All).
17. **Accountant invite:** if a firm invited you, "Share your receipts with …?" is at the top of Receipts. Yes, share: "Done." then the card goes.
18. **Account:** rows like iOS Settings. Export receipts: tap a month, the share sheet opens with the ZIP (try Save to Files). Currency: tap another, the receipts' totals follow. Your accountant: invite by email, stop sharing, the weekly reminder switch.
19. **Automatic forwarding:** Account → Set up automatic forwarding. "Email me the steps" sends the guide to your inbox. Pick Gmail: one step per screen, Back and Next at the bottom, the button names in your Gmail's language (switch it at the top). The code step waits for Gmail's code by itself.
20. **Delete account** (try it on a test account only): Account → Delete account. Export everything, turn the switch on, Delete my account, confirm. If you signed in more than 30 minutes ago it asks for a new code from your email first, then deletes and goes back to the sign-in.
