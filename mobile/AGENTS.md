# The native iPhone app (`mobile/`)

Read `README.md` here first, and the repository's root `AGENTS.md` and `DESIGN.md`: their rules apply here too (Store apps, Design System, Languages).

## Expo has changed — don't trust memory

This is Expo SDK 58 (`expo` in `package.json`) with React Native 0.88 and Expo Router. APIs move every SDK. Before using an Expo or React Native API, read its type definitions in `node_modules/` (they are exact for this version) or the versioned docs at `https://docs.expo.dev/versions/v58.0.0/` (reachable through Firecrawl when the session network blocks docs.expo.dev). Seen so far: `headerLargeTitle` is deprecated for `headerLargeTitleEnabled`; a TextInput ref is `TextInputInstance`; `StyleSheet.absoluteFillObject` is gone (use `absoluteFill`).

## Rules

- **No prices, plans, trials, "subscribe" or links to buy anywhere in the app** (App Store 3.1.3(f), root `AGENTS.md` → Store apps). Also no "free during the pilot": it implies a price later.
- **Every string in `src/i18n/en.ts`, `sv.ts` and `fr.ts`.** No text in a screen file.
- **Business rules stay on the server.** The app shows what `/api/mobile/*` returns; a new screen needs a server route that returns ready-to-show data, built from the same library code as the website (see `src/lib/home/load-home.ts` at the root).
- **Shared types only with `import type`** from `@/lib/mobile/types` (the website's `src/`). Never a value import from `@/…`: it would pull server code into the app.
- **Secrets never in the app.** Only public values (`EXPO_PUBLIC_*`): the API URL, the Supabase URL and the publishable key. The session lives in the Keychain (`expo-secure-store`), never in AsyncStorage.
- **Feel:** every tap answers within a frame (`PressableScale`), haptics on success, errors and copy, the saved list before the network, native navigation (stack push, large titles, tab bar, sheets). No spinners on an empty screen.
- Native modules only with `npx expo install` (offline: `EXPO_OFFLINE=1`), then `npm run typecheck`, `npm test` and the `expo export` bundle check from `README.md`.
