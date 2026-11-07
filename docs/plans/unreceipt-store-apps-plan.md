# UnReceipt — Store apps plan (App Store + Google Play, one app for both roles)

**Date:** 2026-11-06
**Goal:** one app, "UnReceipt", on the App Store and Google Play. It wraps `app.unreceipt.com` with Capacitor. Clients land on `/app` and accountants on `/firm`.
**Starting point:** no Apple or Google developer accounts, no D-U-N-S request yet. You have a Mac. `PILOT_MODE` is on, so no payments.

**Sources:** the "Track C — Store apps with Capacitor" (C1–C11) plan from the previous session is **not in this repo, not on any remote branch and not in the session files**, so it couldn't be read. This plan is rebuilt from `docs/plans/unreceipt-launch-plan.md` Phase 4 (actions 70–83) and Phase 8 (114–120), `AGENTS.md`, `DESIGN.md` and the code at `main`. If C1–C11 contained decisions that differ from this plan, paste them and this plan gets reconciled.

Labels: **Y** = you, **B** = built by Claude (one PR each, reviewed by the matching agent from `.claude/agents/`). Launch-plan action numbers are in brackets.

---

## 0a. No company yet (updated 2026-11-06)

There is no AB yet, so there is no D-U-N-S number, and neither store will open an **organization** account. The goal right now is to validate the product with pilots, not to launch publicly. So:

- **Validate first with what already works.** `app.unreceipt.com` is already an installable PWA: camera capture via the file input. iOS 16.4+ also allows web push for home-screen apps, but UnReceipt doesn't send push yet. Many pilot questions need no store app at all: do people forward receipts, does the accountant use `/firm`?
- **For a native pilot, enrol as an individual.**
  - **Apple:** Developer Program as an **individual**, 99 USD a year, no D-U-N-S. Distribute through **TestFlight** only: up to 10,000 external testers through a public link, with a light Beta App Review. Apple's DSA page says TestFlight-only distribution doesn't make you an EU "trader", so no public address is needed yet. The seller name shown is your own legal name.
  - **Google:** Play Console **personal** account, 25 USD. Internal testing (up to 100 testers, no review) is enough for pilots. Google's "12 testers opted in for 14 days in closed testing" rule applies to personal accounts and only matters for **production** access. Firebase App Distribution, or simply sending the APK, works with no Play account at all.
- **When a company exists**, before the public launch and before payments are switched on:
  - Apple: request the individual → organization conversion with the D-U-N-S. Forum reports show it can take weeks to months, so start it well before launch. The fallback is an app transfer to a new organization account.
  - Google: create an organization account and transfer the app; the package name moves with it.
  - Bundle ID and package name stay `com.unreceipt.app` in both cases.
- **Code impact:** none. Everything in §3 is the same; only who signs the builds changes.

## 0. Findings from the code that change the plan

**Status 2026-11-06:**
- Fixed on `claude/epic-babbage-2eexd3`: **1** (deletion for firm staff, with firm handover or close) and **2** (native "store-safe" mode: no prices or purchase CTAs, `/subscribe` neutral screen, `/api/checkout` 403).
- Partly fixed: **3**. The app's login asks for the code; links on our own domain still wait for B10.
- Waiting for the shell (B2/B4): **4**.

These come from reading the code, not from the old plan. Four of them would get the app rejected or broken if nobody fixed them.

1. **Accountants can't delete their account in the app.** `DeleteAccountSection` lives only in `/app/settings`, and `/app` redirects firm-only users to `/firm`. `/firm/settings` has member removal only. Apple 5.1.1(v) requires in-app deletion for any account that can be created in the app, and an accountant can create one there (by accepting a client's invite). This is a **rejection** as things stand → B3.
2. **"No purchase buttons" is not enough for iOS.** The rule that lets you skip in-app purchase is 3.1.3(f), "free stand-alone companion to a paid web tool". It allows **no purchasing in the app and no calls to action for purchase outside it**. The product currently has several:
   - `UsageMeter`: "Extra receipts are €0.40 each", "… would cost €X instead of €Y a month. Write to us to switch."
   - The login page's logo links to `/`. On the app host that goes to the marketing site, which has pricing and "Start your free week".
   - Once `PILOT_MODE` is off, the gate redirects users without a subscription to `/subscribe`.

   All of these need a "native" variant → B1.
3. **Email links don't go to our domain.** The Supabase templates use `{{ .ConfirmationURL }}`, which points at `<project>.supabase.co/auth/v1/verify`. Universal Links / App Links on `app.unreceipt.com` will therefore **not** open the app from a sign-in email. The 6-digit code (`_code-step.tsx`) already works inside a webview, so the app's sign-in is code-first, with no dependency on links. A link on our own domain comes later (B6, B10).
4. **Downloads don't work in the webview.** Receipt PDFs and originals use `<a download>`, and exports return signed URLs. Neither WKWebView nor Android WebView downloads anything unless the app handles it, and Capacitor doesn't by default. For accountants, the export *is* the job, and account deletion asks people to download their data first → B4.
5. **Capacitor's own docs say `server.url` is "not intended for use in production".** Loading the remote site is still the only realistic option: the app is server-rendered Next.js with cookie auth, so it can't be exported as static files. What that costs:
   - App Review risk under 4.2 (minimum functionality), which the native features below offset (scanner, share sheet, push, offline screen).
   - No offline start. A bundled error page covers that (`server.errorPath`).
   - Every web deploy changes the app instantly, which is why B12 adds a minimum-shell-version check.
6. **The product is English only** (Launch-plan actions 49–50 are open), while the listing targets Sweden and France. It isn't a store blocker: the listing can be written in Swedish and French, and the store shows "English" as the app language. It is a conversion risk.

---

## 1. Decisions to confirm (Y0, before B5)

| # | Decision | Recommendation | Why |
|---|---|---|---|
| S1 | Bundle ID / package name | `com.unreceipt.app` on both platforms | It can never be changed after the first upload. |
| S2 | Devices | **iPhone only** on iOS; phones on Android | iPad support means iPad screenshots, iPad review and layout work. Accountants use the desktop web anyway. |
| S3 | Purchases in the apps | **None on either platform.** Billing stays on the web, paid by the company. | iOS 3.1.3(f). Applying the same rule on Android avoids Play Billing questions, and one rule is simpler to test. |
| S4 | New sign-ups in the app after the pilot | Allowed. A user without a plan sees a neutral "This account isn't active yet" screen with no price, no link and no "visit our website". | Under 3.1.3(f) this is allowed. Reviewers sometimes still push back; if they do, switch to "invited users only". |
| S5 | iOS push | **APNs directly** from the server (`.p8` key) for iOS, FCM HTTP v1 for Android | This changes action 79. FCM on iOS needs the Firebase SDK inside the app, which adds a third-party SDK to the privacy manifest. Sending to APNs directly is a small Node `http2` sender. |
| S6 | Countries | Sweden and France first, or the whole EU | Either works. More countries mean more trader-status visibility and nothing else. |
| S7 | Offline capture queue (76), biometric lock (82), weekly push (83), photo scan (90–92), Wallet ping (93–95) | **Launch 2** | None of these is needed to pass review. The scanner, share sheet, push and offline screen already put the app clearly past a "repackaged website". |

---

## 2. What you do (Y)

### Start today (no accounts needed)
- **Y1 — Look up the D-U-N-S number** with Apple's tool: <https://developer.apple.com/enroll/duns-lookup/>. Many Swedish ABs already have one, because Dun & Bradstreet imports from Bolagsverket.
  - Check that the **legal name and address match Bolagsverket exactly**. Apple and Google reject on mismatches, and correcting D&B data is the slow part.
  - If there's no number, request it through the same form. It's free. D&B says up to 5 business days, and Apple can take about 2 more business days to see it.
- **Y2 — Company identities:**
  - An Apple Account with two-factor authentication, on a `@unreceipt.com` address.
  - A company Google account for Play Console and Firebase.
  - A business phone number and postal address you're willing to publish. The EU Digital Services Act requires "trader" details to be shown on both stores for apps distributed in the EU.
- **Y3 — Tools on the Mac:** current Xcode from the Mac App Store, then Android Studio. Turn on Developer Mode on your iPhone (Settings → Privacy & Security). If you have an Android phone, turn on USB debugging. Otherwise use the emulator.
- **Y4 — Create a Firebase project** with the company Google account. The free plan is enough. Add an Android app with package `com.unreceipt.app` and download `google-services.json` (it isn't secret, but keep it out of git). Then create a service account for FCM and put its JSON into Vercel as a server-only env var (name set in B8).
- **Y0 — Confirm S1–S7** above.

### Once D-U-N-S is active
- **Y5 — Apple Developer Program, organization:** 99 USD a year, charged in local currency.
  - Enrol in the Apple Developer app on your iPhone. It's the fastest route.
  - You must have signing authority for the AB. Apple may phone to verify.
  - Expect from a few days to about two weeks.
- **Y6 — Google Play Console, organization:** 25 USD once.
  - Verification needs the D-U-N-S, the developer website, and a verified phone and email.
  - Organization accounts are exempt from the "12 testers for 14 days" closed-test rule that applies to new personal accounts. That's a strong reason not to enrol as an individual.
- **Y7 — Trader status (DSA)** in App Store Connect (Business) and in Play Console.

### After Apple approves
- **Y8 — Apple setup:**
  - Send me the **Team ID**.
  - Register the App ID `com.unreceipt.app` with Push Notifications, Associated Domains and App Groups (the share extension needs App Groups), plus `com.unreceipt.app.share`.
  - Create an **APNs Auth Key (.p8)**. Put the key, its Key ID and the Team ID in Vercel env (server-only, names set in B8). Never commit the key.
- **Y9 — App Store Connect record:**
  - Name, then subtitle. Check name availability early, because "UnReceipt" could already be taken.
  - Category Business (secondary Finance), price Free, availability per S6.
  - App Privacy answers and age rating, from my drafts (B11).
  - Privacy, support and marketing URLs (B3).
  - No Paid Apps agreement and no bank or tax forms: the app is free.

### After Google approves
- **Y10 — Play setup:**
  - Create the app and keep **Play App Signing** on. Send me the SHA-256 of the app-signing certificate (for App Links) and of your upload key.
  - Complete App content from my drafts (B11): privacy policy, app access (demo login), ads (none), content rating (IARC), target audience (18+), Data safety, the **Financial features** declaration (every app must answer it), and the account-deletion URL.
  - Upload to the **internal testing** track.

### Testing and launch
- **Y11 — Device testing** on both phones for every build. I hand you a checklist per PR: sign in with the code, kill the app and reopen it, scan, share in, receive a push, download an export, delete a test account.
- **Y12 — Betas:**
  - TestFlight internal: you, no review.
  - Then TestFlight external for the pilot companies, after Beta App Review, typically about a day.
  - Play internal, then closed testing for the pilots.
- **Y13 — Submit to both stores.** Apple review usually takes 1–3 days. Plan for **at least one rejection round** (4.2 or 3.1.1 are the likely ones), and answer through Resolution Center with the review notes from B11. Google's first review of a new developer account can take up to about a week.
- **Y14 — Before `PILOT_MODE` goes off:** open the app with an account that has no plan and check that the S4 screen appears and shows no prices. The web change goes live in the app instantly, without a new review.

---

## 3. What Claude builds (B), in order

### Before any account exists (all testable on the simulator, the emulator and your own iPhone)

Xcode's free "Personal Team" signs the app onto your own iPhone for 7 days at a time. It can't use push, Associated Domains or App Groups. Android has no such limits, so push and share-in are fully testable there before Google approves.

- **B1 — Native-aware web: "store-safe" mode** [81]. Deployable now; no change for web users.
  - The native shell appends `UnReceiptApp/<version> (ios|android)` to the user agent.
  - A shared `isNativeApp()` reads that marker on the server; on the client it uses `Capacitor.isNativePlatform()`.
  - In native mode:
    - `UsageMeter` shows counts only: no prices, no "switch plans".
    - The login logo stops linking to the marketing site.
    - `/subscribe` and the gate's `redirect_subscribe` render the S4 neutral screen.
    - Stripe Checkout is never opened.
    - Links to other hosts open in the system browser, so the marketing site never shows inside the app.
  - Tests cover each surface in web and native mode.
- **B2 — Capacitor shell** [70, 74, 75]:
  - `capacitor.config.ts`, `ios/`, `android/`, appId per S1, `server.url = https://app.unreceipt.com`, plus a dev override that points at localhost or a Vercel preview.
  - Bundled offline/error page (`server.errorPath`) in UnReceipt's design, with a "Try again" button. The app never shows a blank page.
  - Icons and splash from the isotype, status bar and safe areas checked against `DESIGN.md` (the FAB is already safe-area aware).
  - Android back button follows history.
  - The service worker isn't registered inside the app, so native users never get stale cached code.
  - Info.plist camera and photo-library usage strings, without which the existing file input **crashes** on iOS.
  - `ITSAppUsesNonExemptEncryption = NO`, a privacy manifest (`PrivacyInfo.xcprivacy`), and iPhone-only per S2.
- **B3 — Accounts and store URLs** [44 gap]:
  - Account deletion in `/firm/settings` for firm staff, reusing `deleteAccount()` and the same two-step warning. The firm and its clients' data are left untouched, as `AGENTS.md` already describes. If you are the firm's last member, the dialog says what happens to the firm.
  - A public **support page** for Apple's Support URL.
  - A public **"delete your account" page**, required by Google Play: steps plus support email, reachable without the app.
  - Both pages are added to `APEX_ONLY_EXACT` and the sitemap.
- **B4 — Downloads in the app.** In native mode, receipt PDFs, originals and export ZIPs open in the system viewer and share sheet (Files, Mail, AirDrop) instead of `<a download>`. The web keeps its current behaviour.
- **B5 — The scanner** [73]. A native document scanner with edge detection and crop: VisionKit on iOS, ML Kit Document Scanner on Android (no camera permission needed). It feeds the existing `CaptureDialog` → `/api/ocr` → `/api/capture` flow unchanged, and photo and file pick remain as fallbacks. A maintained community plugin or a small local plugin, whichever is healthier at build time.
- **B6 — Sign-in in the app** [72]:
  - The login screen says "enter the 6-digit code" in native mode; password sign-in is unchanged.
  - Check that the session survives a cold restart on both platforms. Android WebView can lose cookies that haven't been flushed to disk; flush on pause if needed.
  - Check that accountants land on `/firm` and clients on `/app`. People who are both get a visible switch between the two (today only the firm side links back to `/app`).
- **B7 — Share to UnReceipt** [77]:
  - Android intent filter for PDFs and images: done and tested in this phase.
  - iOS share extension and App Group: code written now, tested on a device after Y8.
  - Shared files go through the same upload limits and `rateLimit()`.
- **B8 — Push** [78–80]:
  - A `device_tokens` table: RLS, owner-only select, written only by a server route, appended to `schema.sql` per `AGENTS.md`.
  - A token registration route, plus deletion on sign-out and on account deletion.
  - The sender: FCM HTTP v1 for Android and APNs directly for iOS, per S5.
  - "Receipt from ICA added — 245 kr" when a forwarded receipt is ready, and an on/off switch in settings.
  - Android works end to end in this phase; iOS once Y8's key exists.
- **B9 — Review package, drafts** [116, 114, 115]:
  - Two demo reviewer accounts with password sign-in and seeded data: a **client** with receipts, and an **accountant** firm linked to a demo client. Both are excluded from the retention job and the sign-up digest.
  - Review notes that explain the native features and why there's no purchase (3.1.3(f)).
  - Store listing copy in English, Swedish and French.
  - App Privacy and Data safety answers derived from the code. Collected: email, name, receipts (financial information), photos the user picks, a device token, and diagnostics through Sentry. Processors: Supabase, Anthropic, Resend, Vercel, Sentry, Stripe (web only).
  - The privacy page gets push tokens and the app added.
  - Screenshots at App Store 6.9″ and Play phone sizes, taken from the real app with the demo accounts.

### After the accounts are approved
- **B10 — Universal Links / App Links** [71]:
  - `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`, served from env values: Team ID from Y8, SHA-256 from Y10.
  - Limited to `/auth/*`, `/app/accountant/*`, `/app/firm-request/*` and `/firm/*`, so other links keep opening in the browser.
  - Exempted from host redirects in `proxy.ts`, and the Associated Domains entitlement added.
  - Then the Supabase templates move to a link on our own domain (`/auth/confirm?token_hash=…`, a `verifyOtp` call that needs no PKCE cookie). Tapping the email opens the app. This also fixes the web case where the link opens in a different browser.
- **B11 — Final store forms.** I fill in the B9 drafts with the real URLs, demo credentials and screenshots, and give you a copy-paste sheet for each App Store Connect and Play Console field.
- **B12 — Release plumbing:**
  - A version-bump script for both platforms.
  - A server-side **minimum shell version**: an outdated app shows "Please update UnReceipt" instead of calling a plugin it doesn't have.
  - `docs/RELEASING.md`: archive in Xcode, upload, and build an AAB in Android Studio. CI builds come later, not before launch.
  - A section in `AGENTS.md` with the native rules: no purchase CTAs in native mode, new plugins need a version gate, and downloads go through B4.
- **B13 — After approval** [119]: store badges and an updated CTA on the landing pages in all three languages.

---

## 4. Order and timeline

The critical path is outside the code: D-U-N-S, then enrollment, then review. Code only becomes the bottleneck if enrollment is quick.

| Week | You | Claude |
|---|---|---|
| 0 | Y1–Y4 today, Y0 decisions | B1, B2 |
| 1 | Y5/Y6 as soon as D-U-N-S is active; device-test B2 on your phones | B3, B4, B5, B6 |
| 2 | Y7–Y10 as approvals arrive | B7, B8 (Android end to end), B9 |
| 3 | TestFlight internal, Play internal; then pilots on external beta and closed test | B10, iOS push and share extension, B11, B12 |
| 4–5 | Submit both; at least one rejection round | Fixes from beta and review |
| after | Y14 before payments are switched on | B13; Launch 2 items |

**Honest ranges:**
- If a D-U-N-S already exists and both enrolments go smoothly: **about 4 weeks** to public listings.
- If the D-U-N-S has to be requested, or D&B data needs correcting: add **1–4 weeks** at the start.
- The code side (B1–B9) doesn't wait for any of this.

**Main risks:**
1. Apple 4.2 ("repackaged website"). Mitigated by B2, B5, B7 and B8, plus clear review notes.
2. Apple 3.1.1/3.1.3. Mitigated by B1. Re-check it every time pricing copy changes.
3. Apple 5.1.1(v). Fixed by B3.
4. A web deploy breaks the app with no review in between. Mitigated by B12, and by trying every PR that touches `/app` or `/firm` in the app once (Y11).
