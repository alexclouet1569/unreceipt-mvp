# UnReceipt — Launch plan (web + App Store + Google Play)

**Date:** 2026-10-14
**Inputs:** `docs/plans/*` (brand + digital receipt, gap fixes, handoff prompts), the Oct 2026 decision report ("receipt-to-claim autopilot for Swedish SMEs"), and a full audit of this repo at `7ec3b44`.
**Not used:** the claude.ai chat linked in the request. It is private and could not be fetched. If it has decisions that aren't in the files above, paste them in and this plan gets updated.

---

## 0. Honest starting point

**What already works (don't rebuild):**
- Email and password login, plus magic link.
- Photo or PDF capture with Claude OCR.
- Per-user forwarding address with Resend inbound, signature checks and dedupe.
- Uber and Stripe templates, with an LLM fallback for everything else.
- Line items, the Original tab, a real react-pdf download, re-run extraction, and Stripe checkout with a pilot-mode bypass.
- RLS on every user table, and private storage buckets.
- 320 unit tests passing; tsc and lint clean; CI on every PR.
- The database is in Supabase `eu-central-1` (Frankfurt, EU).

**What blocks a public launch today:**
1. **One real security bug.** A leaked Stripe `session_id` lets any account take over someone else's subscription (`src/lib/self-heal.ts`). I checked this by hand.
2. **No cost protection.** Any free signup can call `/api/ocr` in a loop and run up the Anthropic bill: no rate limit, and no paywall on API routes.
3. **Outdated dependencies.** `next@16.2.2` is pinned and has a critical advisory (proxy bypass, which matters because `/admin` relies on the proxy). `npm audit` reports 27 vulnerabilities.
4. **No native app.** No Capacitor, Expo or RN; nothing for the stores.
5. **App Store hard requirements are missing:** account deletion in-app, a terms page, and correct privacy disclosures (Anthropic isn't listed as a sub-processor).
6. **Swedish compliance (the moat in the decision report) is barely started.** No org.nr check, no 4,000 kr rule, no representation flow, no proof-PDF hash.
7. **No push, no inbox access, no photo-library scan, no payment detection.** These are the agent features you asked for, and none of them exists yet.

**Where I disagree with the brief:**
- **The three agent features carry the most risk.** "Access to emails", "scan photos" and "know when you paid" have the longest lead times and the most store and policy risk. If they all have to be complete before launch, launch slips by months. The plan ships a *lite* version of each in Launch 1 and the full version in Launch 2.
- **Real-time "you just paid" is mostly impossible for a third-party app.** Banks don't push card events to apps like ours. The only real-time route is an iOS Shortcuts Wallet automation, and it only covers **Apple Pay on iPhone** (blank values are occasionally reported). Open banking gives *daily* transactions, not instant ones, and costs money. On Android, reading bank notifications is fragile and risky under Play policy, so I'd skip it.
- **Full Gmail access is expensive.** It requires a restricted scope, which means Google's CASA security assessment: about one month and roughly $540+/year on the cheapest reported track, plus yearly re-verification. The decision report also says to prefer forwarding over mailbox OAuth for GDPR. Auto-forward rules give most of the value at zero cost, so Gmail OAuth only goes ahead if pilots prove they need it.
- **Pricing doesn't match the market.** The app sells **€49/month per account**. Your own report says the Swedish market anchors at **49–99 kr per user per month**, billed to the company. That's a 5–10× gap. Decide before turning payments on.
- **The design docs contradict each other.** DESIGN.md says the page background is cream `#FAFAF7` and mint is "never the page background". `globals.css` uses mint `#ECF7E7`, following the older plan. Pick one (D7).
- **`unreceipt-email` and `unreceipt-email-mvp` are empty repos.** Keep everything in `unreceipt-mvp` (one app, one deploy) and archive those two.

---

## 1. Decisions (locked 2026-10-14)

| # | Decision | Locked choice |
|---|---|---|
| D1 | Pricing | **Flat monthly plans per company, sized by receipts, excl. VAT** (revised 2026-10-15, §1a): Light €5.99 / 15, Regular €14.99 / 50, Heavy €29.99 / 150, then €0.40 per extra receipt. Validate receipt volumes with pilots before turning payments on. |
| D2 | Store apps | **Capacitor** shell around `app.unreceipt.com`, plus native plugins. |
| D3 | Email | Forwarding and guided auto-forward rules now. Outlook OAuth, then Gmail OAuth, only if pilots need it. |
| D4 | Photos | iOS on-device scan with confirmation; Android photo picker. |
| D5 | Payment moment | iOS Wallet automation. Make setup as close to one tap as iOS allows (§1b). Open banking later. |
| D6 | Integrations | Fortnox first, Findity in parallel, email fallback. **France added as Launch 3** (§1c). |
| D7 | Page background | Cream `#FAFAF7`, per DESIGN.md. `globals.css` changes in action 37. |

### 1a. Pricing (revised 2026-10-15 against the European receipt-data report)

**What the data says:**
- **Volume:** about 48–52% of Swedish employees ever expense anything; in 1–9 person firms it's about 75%. A claimant files somewhere between 12 and 62 receipts a year (base case 27). No study since 2015 measures this properly, so it's a range, not a number.
- **Price anchors in Sweden:** Fortnox charges 4.90 kr (~€0.44) per receipt; Spiris 3.90–13 kr per item; seat tools 99–224 kr per user per month.
- **Price anchors in France:** €5–7 per active declarant per month.

**What was wrong with the first plans (#66):** Heavy at €15.99 for 100 receipts was €0.16 per receipt, cheaper than OCR-only tools (AutoEntry €0.24–0.38). The allowances also didn't match team sizes.

**What's live in code now:**

| Plan | Price / month (excl. VAT) | Receipts | Fits | Per receipt |
|---|---|---|---|---|
| Light | €5.99 | 15 | 1–3 people | €0.40 (≈ Fortnox) |
| Regular | €14.99 | 50 | up to ~20 people | €0.30 |
| Heavy | €29.99 | 150 | up to ~50 people | €0.20 |
| Extra receipt | €0.40 | — | — | — |

**How the limit works:**
- Every receipt counts once, deleted ones included.
- Saving is never blocked. Above the allowance, each extra receipt is billed through a Stripe meter.
- Nothing extra is billed during the free trial.
- Users see a warning at 80% of the allowance, and a cheaper-plan hint once overage makes the next plan cheaper.

**Example:** a 20-person company in the base case sends ~22 receipts a month, so Regular at €180 a year. That's comparable to Fortnox per-receipt pricing and 7–10× cheaper than the seat tools.

**Still to validate:** the receipts per claimant per month. The usage ledger now measures it for every pilot, which gives the benchmark the report says nobody publishes.

- [ ] P1 🧑 S — In every finance-owner interview, ask the four Van Westendorp questions: too cheap / a bargain / getting expensive / too expensive. That's 15 minutes per interview.
- [ ] P2 🤖 S — After 3 months of pilots, read receipts per claimant per month from `receipt_usage` and re-size the allowances.
- [ ] P3 🤖 M — Stripe customer portal so customers can switch plans themselves. Until then, the hint says "write to us".
- [ ] P4 🤖 S — Annual prepay at 2 months free. Improves cash flow and reduces churn.
- [ ] P5 ★ 🤖 S — Daily sweep that re-reports extra receipts whose Stripe meter call failed (`overage_billed_at IS NULL` and above the allowance). Safe to repeat: Stripe dedupes on the receipt id. Needed before payments go live.

### 1b. Payment-moment automation (D5): how close to automatic it can get

**The hard limit:** iOS doesn't let an app create a Shortcuts *personal automation* for the user. The user has to create it once. We can cut that to about 5 taps:
- [ ] 94a 🤖 M — Ship an **App Intent** "Log a payment in UnReceipt" from the iOS app. The automation becomes "Wallet → After payment → *Log a payment in UnReceipt*", with no URL or token to copy, and merchant and amount pass straight through.
- [ ] 94b 🤖 S — In-app guided setup: a 20-second screen recording plus a deep link that opens the Shortcuts Automation tab.
- [ ] 94c 🤖 S — "Did it work?" check: after setup we ask for a test payment or a tap on "Run" and confirm the ping arrived.

**Android:** there is no equivalent. Payment nudges there come with open banking (action 97).

### 1c. France (Launch 3, after Sweden pilots convert)

**Why later, not now:** France doubles the compliance work. It has different VAT recovery rules and different digitisation rules (copie fiable). It also has different integrations and a lower price anchor (~€5–7/user). Doing it in parallel would slow down the Swedish launch.

**What we do now so it's cheap later:**
- `country` on the organisation.
- Compliance rules keyed by country (action 60 builds this shape).
- i18n with `fr` as a third locale (action 49).

**France actions (when Launch 3 starts):**
- [ ] F1 🧑 M — Lawyer or expert-comptable review: rules for a **copie fiable** of an expense receipt. The arrêté of 22 March 2017 and décret 2016-1673 cover invoices; URSSAF applies them to expense reports. The integrity presumption needs a qualified eIDAS timestamp or seal, so we need a qualified trust service provider (QTSP).
- [ ] F2 🤖 M — Qualified timestamp on every proof PDF (QTSP API), if F1 confirms it's needed.
- [ ] F3 🤖 M — French VAT rules config (recovery differs by expense type; to be confirmed with the expert-comptable).
- [ ] F4 🧑 S — Confirm **Pennylane**'s public API supports uploading receipts (justificatifs) or creating expenses. It's the default accounting tool for many French SMEs and their accountants.
- [ ] F5 🤖 M — Pennylane integration (if F4 confirms).
- [ ] F6 🧑 S — Check the Qonto API for attaching receipts to card transactions. Qonto is common among French SMEs.
- [ ] F7 🤖 M — `fr` translations and a French landing page.
- [ ] F8 🧑 M — 3 French pilot companies. Expert-comptable firms are the multiplier channel, as redovisningsbyråer are in Sweden.

**Note:** France's B2B e-invoicing reform (receiving becomes mandatory from 1 Sept 2026, per Pennylane) covers supplier *invoices*, not employee expense receipts. It doesn't remove the problem we solve.

## 2. How we execute

- **One action = one commit.** Under ~200 changed lines, with tests, and every commit passes tsc, lint and unit tests on its own. Commits go to the working branch, and a batch (e.g. Phase 1) is reviewed and merged as one PR. Small diffs are the main defense against regressions.
- **Order:** Phase 0 runs in parallel because it's mostly waiting on Apple, Google and partners. Phase 1 (security) goes before anything else lands. Phases 2–5 follow in order.
- **Markers:** ★ = needed for **Launch 1** (pilot companies on TestFlight and Play closed test, then the public stores). Everything without a ★ is **Launch 2**.
- **Owners:** 🧑 = only you can do it (accounts, legal, dashboards, real devices). 🤖 = I can do it as a PR.
- **Sizes:** S ≈ under 1 hour, M ≈ half a day.
- **Every schema change** follows the AGENTS.md conventions: idempotent, appended under a dated header, with RLS on private data.

---

## Phase 0 — Accounts, legal, long lead times (start today, in parallel)

- [ ] 1 ★ 🧑 S — Reply with decisions D1–D7.
- [ ] 2 ★ 🧑 S — Get a free **D-U-N-S number** for the AB. Apple and Google both need it for organization accounts, and it can take days.
- [ ] 3 ★ 🧑 S — Enroll in the **Apple Developer Program as an organization** ($99/yr).
- [ ] 4 ★ 🧑 S — Create the **Google Play developer account as an organization** ($25). New *personal* accounts must run a 12-tester, 14-day closed test before production; organization accounts are reported to be exempt (confirm at signup).
- [ ] 5 ★ 🧑 S — Set a **monthly spend cap** in the Anthropic console, and check the data-retention / zero-retention terms.
- [ ] 6 ★ 🧑 S — Supabase: turn on **leaked-password protection** (the security advisor currently warns about this). Confirm the plan includes daily backups or PITR, because these are 7-year accounting records.
- [ ] 7 ★ 🧑 M — Recruit 3–5 pilot companies. Interview the **finance owner** and record which expense/accounting system each uses.
- [ ] 8 ★ 🧑 S — Email Findity's partner team about production access to the Expense API.
- [ ] 9 🧑 S — Register a Fortnox developer app (sandbox).
- [ ] 10 ★ 🧑 M — Get a DPA (personuppgiftsbiträdesavtal) template and a terms-of-service text. Prepare the Skatteverket notification text for storage in another EU country (BFL 7 kap. 3 a §), because the data is in Frankfurt.
- [ ] 11 ★ 🧑 S — Book 30 minutes with an accountant to review the PDF disclaimer and the compliance rules in Phase 3.
- [ ] 12 🧑 S — Contact Kivra about a receipts partnership. Long shot; nothing waits on it.
- [ ] 13 🧑 S — Archive the empty `unreceipt-email` and `unreceipt-email-mvp` repos.

## Phase 1 — Security and cost hardening (🤖, before any new user)

- [x] 14 ★ S — Self-heal: reject the session when `client_reference_id !== userId`, plus a test. **(HIGH)**
- [x] 15 ★ S — Upgrade `next` to the latest patched 16.x; build and run all tests. **(HIGH)**
- [x] 16 ★ S — Call `requireAdmin()` inside the `/admin` and `/admin/[userId]` data loaders, not only in the layout. **(HIGH)**
- [x] 17 ★ M — Postgres rate-limit table and a `rateLimit(userId, key, limit, window)` helper, with no new vendor. Apply it to `/api/ocr`.
- [x] 18 ★ S — Apply the rate limit to `/reprocess` and `/api/capture`.
- [x] 19 ★ S — Apply a per-alias daily cap to `/api/intake/email`.
- [x] 20 ★ S — Enforce the subscription/pilot gate inside the paid API routes, not only on the `/app` page.
- [x] 21 ★ S — Make email dedupe per user: unique `(user_id, intake_ref)`, and add a `user_id` filter to the lookup.
- [x] 22 ★ S — Stop trusting the model's self-reported confidence. LLM-only email extractions land as "needs a glance", pre-filled. This closes the prompt-injection route to fake verified receipts.
- [x] 23 ★ M — Security headers in `next.config.ts`: `frame-ancestors`, nosniff, Referrer-Policy, Permissions-Policy (camera=self). Start CSP in report-only mode.
- [x] 24 ★ S — Waitlist: `ENABLE ROW LEVEL SECURITY` in `schema.sql`, an IP rate limit, and Turnstile/BotID.
- [x] 25 ★ S — Capture upload: MIME allowlist and a 4 MB cap (Vercel rejects bodies over 4.5 MB). Set `file_size_limit` and `allowed_mime_types` on the buckets.
- [x] 26 ★ M — Shrink photos in the browser before upload: max 2000 px, JPEG. Faster, cheaper OCR, and always under the cap.
- [x] 27 ★ S — Generic error messages from capture/ocr/reprocess; keep details in server logs only.
- [x] 28 ★ S — Server-side receipt delete that removes **both** storage objects (image and `.eml`).
- [x] 29 ★ S — Lock columns users must not edit, using column grants or a trigger: `email_alias_hash`, `welcome_email_sent_at`, `status`, `intake_ref`, `is_verified`.
- [x] 30 ★ S — Stripe webhook: ignore stale events (compare `event.created`, or re-fetch the subscription).
- [x] 31 ★ S — Remove the `[auth-debug]` logs and the sender/recipient addresses from intake logs.
- [x] 32 ★ S — `/api/auth/clear`: check the Origin header (logout CSRF). Validate the UUID in `/reprocess`.
- [x] 33 ★ S — CI: add Dependabot and `npm audit --audit-level=high`. Delete `bun.lock` and move `shadcn` to devDependencies.
- [x] 34 ★ M — Sentry (`@sentry/nextjs`) with PII scrubbing; replace every `TODO(step-11)`.
- [x] 35 ★ S — Privacy page: list Anthropic, Resend, Stripe, Supabase (Frankfurt) and Vercel, with the transfer basis. Fix the "magic link only" wording.
- [x] 36 ★ S — Pin Vercel functions to `fra1` or `arn1`, next to the database. Fix the stale 5 MB note in AGENTS.md.

### Phase 1 deploy steps (order matters)

1. **Merge and deploy the code first.** Every new check fails open or works without the SQL: rate limits are skipped while `rate_limit_hit` is missing, and dedupe still works under the old index.
2. **Then apply the SQL in the Supabase SQL editor**, in this order:
   1. `supabase/migrations/20261014_rate_limits.sql`
   2. `supabase/migrations/20261014_intake_ref_per_user.sql`
   3. `supabase/migrations/20261014_waitlist_rls.sql` (already true in production; a no-op)
   4. `supabase/migrations/20261014_receipts_bucket_limits.sql`
   5. `supabase/migrations/20261014_server_only_trust_fields.sql`, **only after step 1 is live.** Applied before the deploy, it would break saving the review form, because the old code writes receipts with the user's own client.
3. **Vercel env:** set `NEXT_PUBLIC_SENTRY_DSN` from an EU-region Sentry project (optional; without it Sentry stays off).
4. **Smoke test on production:**
   - log in
   - capture a photo
   - complete a "needs review" receipt
   - delete a receipt
   - forward an email
   - download a PDF
   - `curl -I https://app.unreceipt.com/app` shows the security headers

## Phase 2 — Complete the core product (🤖)

- [x] 37 ★ S — Apply D7, so the background matches the design source of truth.
- [x] 38 ★ M — `/app/settings` shell: profile, company name, sign out.
- [x] 39 ★ S — Show the forwarding address with a Copy button in settings. Today it only appears when the inbox is empty.
- [ ] 40 ★ S — Pass VAT amount, VAT rate and payment method from OCR through `CaptureDialog` and `CaptureSchema`. Today they're dropped.
- [ ] 41 ★ M — Allow editing **verified** receipts, not only ones that need review. Store an `edited_at` / "edited by you" marker and show it on the PDF; the API refuses these edits (409) until this ships.
- [ ] 42 ★ M — Make VAT and line items editable (extend the PATCH route).
- [ ] 43 ★ S — Check that iPhone HEIC photos work end to end; convert them if needed.
- [ ] 44 ★ M — **Account deletion in the app.** This is an App Store requirement. It deletes storage, rows and the auth user, after a warning to export first because of the 7-year bookkeeping duty.
- [ ] 45 ★ M — Monthly export: a ZIP of PDFs and originals, plus a CSV, for the accountant.
- [ ] 46 ★ S — Terms of service page, linked from signup and settings.
- [ ] 47 ★ M — First-run onboarding in 3 screens: your forwarding address → snap your first receipt → done.
- [ ] 48 ★ S — Admin list includes pilot users who have no subscription row.
- [ ] 49 ★ M — Swedish UI: set up i18n (sv default, en fallback).
- [ ] 50 ★ M — Swedish UI: translate every customer-facing string and email.
- [ ] 51 ★ S — Accessibility pass: contrast, labels, focus, 44 px tap targets.
- [ ] 52 M — Search by merchant, plus the header search icon from DESIGN.md.
- [ ] 53 S — Pagination / infinite scroll past 50 receipts.
- [ ] 54 S — Filter by month and category.
- [ ] 55 M — OCR shimmer skeleton and 480 ms reveal, per DESIGN.md.
- [ ] 56 M — Detail view as a full-screen bottom sheet on mobile, per DESIGN.md.
- [ ] 57 S — GDPR data export (JSON plus files).
- [ ] 58 ★ M — Retention job matching the privacy page: 90 days after cancellation, email a download reminder, then delete account, rows and storage. The seven-year BFL duty is the customer's.

## Phase 3 — Swedish compliance engine (the moat) (🤖, rules reviewed by the accountant)

- [ ] 59 ★ M — Extraction schema: seller org.nr / momsreg.nr, VAT **per rate** (25/12/6), and card last-4 only (never a full card number).
- [ ] 60 ★ S — Rules config file with dated 2026 values: 4,000 kr limit, schablons, and the food-VAT 6% window from 2026-04-01 to 2027-12-31. Next year becomes a config edit.
- [ ] 61 ★ S — Rule: förenklad faktura (≤ 4,000 kr) with no org.nr or VAT shown gets a "Not valid for momsavdrag" badge.
- [ ] 62 ★ S — Rule: over 4,000 kr prompts "Ask the seller for a full invoice".
- [ ] 63 S — Rule: foreign VAT is flagged as non-deductible in Swedish moms.
- [ ] 64 M — Representation flow: attendees (count and names) and purpose fields.
- [ ] 65 S — Representation calculation: deductible moms using the 36 / 46 / 33 kr schablons.
- [ ] 66 M — Capture quality check (blur, cut-off edges) with a retake prompt.
- [ ] 67 ★ M — Proof PDF v2: the original embedded unaltered, plus extracted data, a SHA-256 hash, the capture timestamp and the BFL 5 kap. fields.
- [ ] 68 ★ S — Check that PDF attachments in forwarded emails are stored byte-for-byte as received.
- [ ] 69 ★ M — Fixture test suite: 20 real Swedish receipts with expected rule outcomes.

## Phase 4 — Native apps with Capacitor (🤖 builds it, 🧑 runs Xcode/Android Studio on real devices)

- [ ] 70 ★ M — Add Capacitor: `ios/` and `android/` projects, `server.url = https://app.unreceipt.com`, bundle id `com.unreceipt.app`.
- [ ] 71 ★ M — Universal Links / App Links (`apple-app-site-association`, `assetlinks.json`) so magic-link and auth emails open the app.
- [ ] 72 ★ S — Check that the login session survives an app restart (webview cookies).
- [ ] 73 ★ M — Native **document scanner** (auto edge-detection and crop) replaces the file input in the app.
- [ ] 74 ★ S — Icons, splash screen, status bar and safe areas, from the brand isotype.
- [ ] 75 ★ S — Bundled offline screen. The app must never show a blank page (guideline 4.2).
- [ ] 76 ★ M — Offline capture queue: the photo is kept on the device and uploaded when back online.
- [ ] 77 ★ M — **Share sheet**: "Share to UnReceipt" from Mail, Photos, Files and Kivra PDFs (iOS share extension, Android intent filter).
- [ ] 78 ★ S — `device_tokens` table (RLS, owner-only) and token registration.
- [ ] 79 ★ M — Push sender (FCM HTTP v1 for both platforms) and notification preferences in settings.
- [ ] 80 ★ S — Push when a forwarded receipt is ready: "Receipt from ICA added — 245 kr".
- [ ] 81 ★ S — Inside the iOS app, no purchase buttons or links (guideline 3.1.1); billing happens on the web, company-paid.
- [ ] 82 S — Optional Face ID / biometric app lock.
- [ ] 83 S — Weekly push: "3 receipts need a glance".

## Phase 5 — The agent features (email, photos, payment moment)

**Email**
- [ ] 84 ★ M — Gmail auto-forward setup. Gmail sends a **confirmation code to the forwarding address**: detect that email in intake and show the code/link to the user in the app.
- [ ] 85 ★ S — Guided setup screen for Gmail and Outlook/M365 forwarding rules, with a "test it" button.
- [ ] 85a ★ M — Verify inbound authentication (DKIM/SPF/ARC results on the received message) before a sender-based template marks a receipt verified. Today a spoofed "Uber" or "Stripe" email that fully matches a template is trusted. This must ship before any receipt is pushed to Fortnox/Findity automatically.
- [ ] 86 ★ M — Receipt classifier on inbound mail. Non-receipts are ignored and logged, never shown as receipts. Use a cheaper model for this step.
- [ ] 87 ★ M — **"Is this a receipt? Add it?"** tab: uncertain candidates wait for a one-tap confirm or dismiss.
- [ ] 88 M — Outlook/M365 OAuth (Graph `Mail.Read`), read-only, with a receipt-only search window.
- [ ] 89 M — Gmail OAuth (`gmail.readonly`). **Only after pilots prove demand**, and start the CASA assessment about a month ahead.

**Photos**
- [ ] 90 ★ M — iOS: on app open, scan photos taken since the last scan (with permission) using Vision text recognition on the device. The receipt heuristic looks for total, moms, kr and org.nr.
- [ ] 91 ★ M — Review screen: "We found 4 receipts in your photos — add them?" Only confirmed photos leave the phone.
- [ ] 92 ★ S — Android: multi-select photo picker with the same review screen (no automatic scan, by policy).

**Payment moment**
- [ ] 93 ★ S — Per-user signed "payment ping" endpoint (merchant and amount), with a rate limit.
- [ ] 94 ★ M — iOS Wallet automation setup. Implemented as 94a–94c in §1b: an App Intent, guided setup, and a "did it work" check.
- [ ] 95 ★ S — Ping → push "You paid 245 kr at ICA — snap the receipt?" → opens the scanner with merchant and amount pre-filled.
- [ ] 96 M — Match later receipts to pings. Unmatched pings appear in a "Missing receipts" list.
- [ ] 97 M — Open banking (Enable Banking or Tink): daily card-transaction sync for missing-receipt detection.
- [ ] 98 M — "Can I expense this?" Q&A grounded in Skatteverket rules and the company policy PDF, with citations.

## Phase 6 — Companies and integrations (what the company actually pays for)

- [ ] 99 M — `organizations` and `memberships` tables with RLS. Receipts belong to the employer under BFL.
- [ ] 100 M — Invite employees by email; admin and member roles.
- [ ] 101 M — Finance-owner view: every employee's receipts, their status, and the export.
- [ ] 102 S — Stripe per-seat billing (quantity = active members).
- [ ] 103 M — Fortnox OAuth connection.
- [ ] 104 M — Push a receipt to Fortnox (`inbox_v` plus voucher file connection).
- [ ] 105 M — Findity Expense API: create, attach and submit, if access is granted.
- [ ] 106 S — Fallback: send the PDF to the customer's system inbox (Concur, Pleo Fetch), configured in settings.

## Phase 7 — Quality and operations

- [ ] 107 ★ M — Run Playwright e2e in CI against the Vercel preview.
- [ ] 108 ★ S — Staging Supabase project or branch, so schema changes are tried before production.
- [ ] 109 ★ S — Uptime monitoring and alerts for `/app`, `/api/intake/email` and the Stripe webhook.
- [ ] 110 ★ S — Test restoring from a backup once, before real customer data arrives.
- [ ] 111 S — OCR accuracy benchmark on 50 real Swedish receipts, re-run every release. Try a cheaper model for the classifier.
- [ ] 112 S — Anthropic cost per user per month in `/admin`.
- [ ] 113 S — Move to Supabase CLI migrations; `schema.sql` is past the threshold set in AGENTS.md.

## Phase 8 — Store submission and launch

- [ ] 114 ★ 🧑 M — App Store Connect: listing, privacy "nutrition" labels, screenshots (6.9" and 6.5").
- [ ] 115 ★ 🧑 M — Play Console: data safety form, content rating, screenshots, target API level.
- [ ] 116 ★ 🤖 S — Demo reviewer account with seeded receipts, and review notes explaining the native features.
- [ ] 117 ★ 🧑 S — TestFlight external beta and Play closed test with the pilot companies.
- [ ] 118 ★ 🧑 S — Fix anything from the beta; submit for review; answer any rejection.
- [ ] 119 ★ 🤖 S — Landing page: store badges and an updated CTA.
- [ ] 120 ★ 🧑 S — Turn payments on (`PILOT_MODE` off, D1 pricing) once the pilots convert.

---

## Phase 9 — Agents

**Build agents** (Claude Code subagents in `.claude/agents/`, used on every PR from now on):
- [x] A1 🤖 S — `security-reviewer` checks each diff against the rules this audit produced:
  - `requireAdmin` on admin routes
  - the service-role client never imported from client code
  - `rateLimit` on paid routes
  - RLS and column grants on new tables
  - no PII in logs
- [x] A2 🤖 S — `design-reviewer` flags DESIGN.md violations: off-token colours, mono outside amounts, shadows on cards.
- [x] A3 🤖 S — `compliance-reviewer` checks that changes to the rules config come with dated sources and fixture tests.

**Operations agents** (scheduled tasks, after Launch 1):
- [ ] A4 🤖 S — Daily: Sentry errors, Vercel runtime errors, Supabase advisors, Anthropic spend. Silent unless something is wrong.
- [ ] A5 🤖 S — Weekly: OCR accuracy benchmark plus a summary of user edits to extracted fields.
- [ ] A6 🤖 S — Support inbox triage and draft replies, with a human sending them.

## 3. Realistic timeline

The bottleneck is not code; it's outside lead times (D-U-N-S, Apple and Google enrollment, store review, pilot recruiting).

| Weeks | What happens |
|---|---|
| 1 | Phase 0 started. Phase 1 complete (about 23 small PRs). |
| 2–3 | Phase 2 ★ and Phase 3 ★. |
| 3–5 | Phase 4 (native shell, scanner, share sheet, push). Pilots on TestFlight and Play closed test. |
| 5–6 | Phase 5 ★ (forwarding rules, receipt classifier, photo scan, Apple Pay ping). |
| 6–7 | Store review, then public Launch 1. |
| After | Launch 2: Outlook/Gmail OAuth, open banking, companies and per-seat billing, Fortnox/Findity. |

**Main risks:** App Store rejection under 4.2 or 3.1.1 (mitigated by actions 73–77 and 81); Findity saying no (covered by Fortnox plus email fallback); Anthropic cost (actions 17–20 and 5); OCR accuracy on Swedish receipts (actions 69 and 111).
