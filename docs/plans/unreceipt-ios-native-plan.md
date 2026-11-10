# UnReceipt — Native iOS app plan

**Date:** 2026-11-09
**Goal:** a real iPhone app for companies and freelancers, on TestFlight for the pilots first, then on the App Store. It should feel alive like Instagram or BlaBlaCar, not like a website in a frame.
**Replaces:** the Capacitor approach in `docs/plans/unreceipt-store-apps-plan.md` for the client side. The store rules found there still apply (no purchases or prices in the app, account deletion in the app, demo account for review, D-U-N-S / trader notes).

Labels: **Y** = you (the founder), **B** = built by Claude.

---

## 1. Decisions (2026-11-09, founder)

| # | Decision |
|---|---|
| D1 | A real native app, not a Capacitor wrapper. Built with **Expo (React Native)** in `mobile/`: real iOS navigation, tab bar, sheets, haptics and Apple's document scanner, in TypeScript, sharing the server, the API and the types with the website. |
| D2 | **Companies and freelancers only.** Accountants keep using `/firm` on the web. An accountant who signs in to the app is told to use the web portal (and can still delete their account in the app, Apple 5.1.1(v)). |
| D3 | **TestFlight first** for the pilots, then the App Store once pilots confirm. |
| D4 | Apple Developer Program as an **individual** now. Conversion to an organisation when the company exists (see the store-apps plan §0a). |
| D5 | **Builds in Expo's cloud** (EAS Build) and uploads to TestFlight with EAS Submit, triggered by Claude from the cloud session with an Expo access token stored as a secret. No Xcode needed for each version. |
| D6 | Languages: **English, Swedish, French**, following the phone's language. |
| D7 | Bundle ID **`com.unreceipt.app`** (the Capacitor build was never uploaded, so the ID is free). Development builds use `com.unreceipt.app.dev`. |
| D8 | Capacitor (`ios/`, `capacitor.config.ts`) stays in the repo until the native app is on TestFlight, then it is removed. It is never submitted. |

## 2. What "alive" means here (the design rules)

What made the wrapper feel solid: every screen was a web page, transitions were page loads, nothing reacted to the finger. The app fixes that with:

1. **Immediate response to touch.** Every tap does something visible within one frame: press states that shrink slightly, haptic ticks on save, confirm and delete, optimistic updates (the receipt is in the list before the server answers).
2. **Motion that explains.** Screens slide in from the right and swipe back with the thumb. Sheets come up from the bottom and are dragged away. A saved receipt flies into the list. Springs, not linear fades.
3. **Never a blank screen.** The last list is cached on the phone and shows at once; placeholders shaped like the content, never a spinner in the middle of nothing; pull to refresh.
4. **One action per screen, within thumb reach.** Tab bar: Receipts · Scan (big centre button) · Account. Flows (setup, onboarding) one question per screen, like BlaBlaCar.
5. **The phone's own tools.** Apple's document scanner (finds the edges, flattens the receipt), the share sheet, Face ID later, notifications.
6. **The UnReceipt look** from `DESIGN.md`: cream surface, mint only where allowed, Manrope + Figtree, Geist Mono for amounts only, hairline cards with no shadow (the Scan button is the one shadow).

## Progress

- **2026-11-09** Phase 1 built (PR #126): server sign-in for the app, `/api/mobile/home`, sign-in, tab bar, receipts list, receipt page, account, three languages. Design and security reviewed.
- **2026-11-10** Phase 2 built on the same branch: Apple's document scanner (`react-native-document-scanner-plugin`) and photo picking, an offline scan queue sent to `POST /api/capture/scan`, editing fields in bottom sheets, Confirm, swipe to delete with Undo, the receipt photo with zoom. Not yet run on an iPhone: waiting for the first EAS build.

## 3. Phases

### Phase 1 — Foundation (week 1)
- **B** Server accepts the app's sign-in: `Authorization: Bearer <Supabase access token>` next to the browser cookies, in `getServerUser()` and the few routes that build their own cookie client. Reviewed by `security-reviewer`.
- **B** `GET /api/mobile/home`: everything the home screen needs in one call (receipts with home-currency amounts, forwarding address, onboarding state, accountant invites, plan state), from the same loader as the web dashboard.
- **B** `mobile/`: Expo project, design tokens, EN/SV/FR, sign-in with the 6-digit email code, session in the iPhone Keychain, tab bar, receipts list.
- **Y** Apple Developer Program, Expo account, App Store Connect app record (§4).
- **B** First TestFlight build as soon as Y's accounts exist, even with little in it, so a broken pipeline is found in week 1.

### Phase 2 — The core loop: scan → check → done (week 2)
- Scan: Apple's document scanner, fields filling in live from the streamed OCR, one tap to save, haptic tick. Several receipts at once.
- Receipts: "To confirm" at the top, pull to refresh, swipe to delete with Undo, search and month filter.
- Receipt detail: pushed from the side, zoomable photo, fields edited in place, Confirm.
- Offline: list cached, a receipt saved without a connection is sent when the connection returns.

### Phase 3 — Account and what Apple requires (week 3)
- Email forwarding setup, one step per screen.
- Your accountant: invite, accept, stop reminders.
- Export a month to the share sheet, currency, sign out.
- Delete account (Apple 5.1.1(v)), with the export offered first.

### Phase 4 — Polish and release (weeks 3–5)
- 3-screen onboarding, empty states, icon, splash.
- Notifications: "Receipt from ICA added — 245 kr" (APNs from the server).
- "Share to UnReceipt" from Mail and Files.
- App Store kit drafted by Claude: screenshots, privacy answers, review notes, demo account, listing in EN/SV/FR.
- TestFlight external for the pilots → App Store submission. Plan for one rejection round.

## 4. What you do (Y)

1. **Apple Developer Program** as an individual: <https://developer.apple.com/programs/enroll/>, 99 USD a year. Easiest from the Apple Developer app on your iPhone. Usually 1–2 days.
2. **Expo account** (free): <https://expo.dev/signup>. Then create an access token (Account settings → Access tokens). Don't paste it in the chat: Claude will open a secure form for it.
3. **App Store Connect**: create the app "UnReceipt" with bundle ID `com.unreceipt.app` (Claude gives the exact steps once the account is active). This is also where you find out whether the name is free.
4. **An App Store Connect API key** (Users and Access → Integrations → App Store Connect API), so EAS can upload builds without your Apple password. Also through the secure form.
5. **TestFlight** app on your iPhone. Test every build and tell Claude what feels wrong — that feedback is what makes it feel right.
6. Before the public App Store (not needed for TestFlight): trader contact details for the EU (DSA), the demo account for Apple's reviewer.

## 5. Risks

- **Two front-ends.** Every client-side change is made twice (web and app). Kept down by putting logic on the server and returning ready-to-show data from the API.
- **No device here.** Claude can type-check and test logic, but only a real iPhone tells how it feels. The test loop with you is the bottleneck.
- **App Review.** 3.1.3(f): no prices, plans or purchase links in the app (same rules as `AGENTS.md` → Store apps). 5.1.1(v): account deletion in the app. 2.1: a working demo account.
- **Expo free plan** has a monthly limit on cloud iOS builds; enough for a pilot, a paid plan if not.
