<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Database

`supabase/schema.sql` is the canonical schema. Apply it by pasting into the Supabase SQL Editor; there is no migration runner in this repo.

Conventions for this file:

- All new statements must be **idempotent** — `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` followed by `CREATE POLICY`, `DROP TRIGGER IF EXISTS` followed by `CREATE TRIGGER`. Wrap `ADD CONSTRAINT` in a `DO $$ ... pg_constraint ... $$` block.
- New schema work is **appended** at the bottom under a dated header. Don't rewrite older blocks — the file's order reflects historical bootstrap order, and existing tables don't need re-running.
- One `update_updated_at()` trigger function is defined for the whole file (`CREATE OR REPLACE FUNCTION`). New tables that need it reference the same function — don't define a per-table copy.
- Tables that hold private user data get RLS enabled plus a `Users can view own ...` policy. If only a server route writes to the table (service-role key), don't add INSERT/UPDATE/DELETE policies at all — leave the table writable only via the service role.

Row types live in `src/lib/types.ts` and must be kept aligned with the schema by hand.

Switch to a real migration tool (Supabase CLI under `supabase/migrations/`) once the file crosses ~30 schema-change blocks or two people are editing it concurrently.

# Admin auth

Defense in depth (plan decision A2):

1. **`proxy.ts`** at the project root gates `/admin/:path*` and `/api/admin/:path*` — this is the optimistic check the Vercel CDN can run cheaply. Non-admin browsers are redirected to `/app`; non-admin API callers get a 403 JSON.
2. **`requireAdmin()`** from `src/lib/require-admin.ts` is the real authorization gate. Every admin server action and every `/api/admin/*` route handler must call it before doing anything else. It re-reads the session cookie and re-checks the allowlist. Throws `AdminAuthError` on failure.

`src/lib/auth-admin.ts` exports the pure `isAdminEmail()` matcher. Both the proxy and `requireAdmin()` share it so the policy is defined once.

`src/lib/supabase-admin.ts` exposes `getSupabaseAdmin()` — a Supabase client built with the **service-role** key. This bypasses RLS and is god-mode for the database. Rules:

- Never import this file from a `"use client"` component, page, or hook.
- Never reference `SUPABASE_SERVICE_ROLE_KEY` from a `NEXT_PUBLIC_*` variable or anywhere it could end up in the client bundle.
- The file is guarded by filename + a top-of-file comment + the fact that the env var is not `NEXT_PUBLIC_*` (so an accidental client import would fail fast at runtime instead of leaking the key).

Required env vars (see `.env.example`): `SUPABASE_SERVICE_ROLE_KEY`, `CONCIERGE_ADMIN_EMAILS`.

# Firm portal auth

`/firm/*` and `/api/firm/*` are the accounting-firm portal (`src/lib/require-firm.ts`). Receipts stay owner-only at the database; the firm reads client data server-side with the service role. Rules:

1. Every `/firm` page calls `requireFirmMemberPage()` and every `/api/firm` handler calls `requireFirmMember()` first. The layout check alone is not enough (layouts don't re-run on client navigations).
2. Any read or write of client data goes through `requireFirmClientAccess(firmId, organizationId)` and is scoped with `.eq("organization_id", <its result>)`. The firm id comes from the session-bound `firm_members` row, never from the request. A client the firm isn't linked to answers 404, like one that doesn't exist.
3. No subscription gate on `/firm`: firm staff have no plan. When they complete a client's receipt, usage is recorded for the **client**.
4. Firm staff are created by email (`firm_members.user_id IS NULL`) and claim the row on their first confirmed sign-in; the pilot firm was bootstrapped by hand in the SQL editor (see the 2026-11-04 block in `supabase/schema.sql`).
5. Links go both ways (2026-11-05, `firm_clients.direction`): a firm invites a client (`/api/firm/clients`), or a client invites its accountant (`/api/accountant/invite`). Either side answers only when signed in with the invited, confirmed address — the link token alone is never enough (`/api/accountant/respond`, `/api/firm-request/respond`). An accountant without a firm creates one by accepting a client's invite; its name is checked by `isAcceptableDisplayName()` (`src/lib/firm/names.ts`) because it goes into emails we send. Every new link emails the client a confirmation (`src/lib/firm/link-emails.ts`).
6. Bank check (2026-11-08): on a client's page the firm imports the client's bank statement CSV (`/api/firm/clients/[orgId]/bank/import`, parser `src/lib/bank/parse-statement.ts`, Swedish/English/French column names, UTF-8 or Windows-1252 decoded in the browser by `src/lib/bank/decode.ts`). Lines go to `bank_transactions` (one company's data, cascades with the organisation, deduplicated by `dedupe_key`). Matching to receipts is computed on read (`src/lib/bank/match.ts`, `month.ts`, `load.ts`): same amount, bank line from 3 days before to 45 days after the receipt, ECB estimates within 3%; only the accountant's decisions are stored (`linked_receipt_id`, `no_receipt_reason`). "Email the list" (`/bank/remind`) sends the month's missing payments to the company's owners (addresses from `memberships`, never the request) with the accountant as Reply-To, rate-limited per company. `DELETE /bank?month=` removes a wrongly imported month. The `/demo/accountant` tour has sample bank lines and answers these routes in the browser.
7. Weekly reminder (2026-11-09): every Monday the client company's owners get one email from the firm (Reply-To: the firm's first admin) listing bank payments of this and last month without a receipt (booked at least 2 days ago) and receipts that still miss merchant, amount or date (`src/lib/reminders/weekly.ts`). Nothing is sent when both lists are empty. The firm switches it per client on the client's page (`firm_clients.weekly_reminder`, on by default, `/api/firm/clients/[orgId]/reminders`). Every reminder, weekly or by hand, is logged in `client_reminders` (counts only); a weekly row is claimed per organisation and ISO week before sending and removed again if no email went out.

# Currency

Each organisation has a home currency (`organizations.currency`, SEK by default, EUR for FR). A foreign receipt keeps its own `total` and gets `home_total` from the ECB reference rate of the purchase day (`src/lib/fx.ts`, rates cached in `fx_rates`), or the amount typed from the bank statement (`fx_source 'manual'`). Conversion happens on read (`ensureHomeAmounts` in `/app`, the firm's client page and exports); the `receipts_clear_stale_fx` trigger drops a conversion whenever amount, currency or date change, from any writer. bookkeeping.csv keeps real kronor (Total SEK) and ECB estimates (Total SEK (ECB estimate)) in separate columns. Rule values and sources: `src/lib/bookkeeping/rules.ts`.

# Stripe local dev

Required env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_LIGHT`, `STRIPE_PRICE_REGULAR`, `STRIPE_PRICE_HEAVY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; for extra-receipt billing also `STRIPE_METER_EVENT_NAME` and `STRIPE_PRICE_OVERAGE` (see `.env.example`).

Plans (Light / Regular / Heavy) are defined once in `src/lib/plans.ts` and shared by the landing pricing, `/subscribe` and `/api/checkout`. Each plan is one recurring monthly EUR price in Stripe for the whole company (quantity 1, no per-user fees), excl. VAT. The Swedish landing page shows SEK instead (`priceSek`: 69 / 169 / 329 kr, extra receipts `OVERAGE_PRICE_SEK` 4,90 kr). To charge Swedish customers those amounts, add them as SEK currency options on the same Stripe prices, the metered overage price included (Dashboard → product → price → **Add a price by currency**); Checkout then shows SEK to customers in Sweden by itself, as long as `/api/checkout` doesn't pass a `currency`. Without the SEK options they are charged the EUR prices. Checkout collects the billing address and VAT number so Stripe Tax applies 25% moms in Sweden and reverse charge for EU businesses; that only happens once the company's VAT registration is added under Stripe → Tax → Registrations. `/api/checkout` never falls back to another price: if a plan's `STRIPE_PRICE_*` env var is missing it returns 500 instead of charging the wrong amount.

Webhook signature verification needs the *raw* request body, so `src/app/api/webhooks/stripe/route.ts` reads `await request.text()` before any JSON parsing. Don't refactor that route to parse JSON eagerly — it will break verification.

To exercise the webhook locally:

1. Install once: `brew install stripe/stripe-cli/stripe`
2. Authenticate once: `stripe login`
3. Forward live events to your dev server: `stripe listen --forward-to http://localhost:3000/api/webhooks/stripe`
4. The CLI prints `Ready! Your webhook signing secret is whsec_xxx` — paste that into `.env.local` as `STRIPE_WEBHOOK_SECRET` (this value is different from the production webhook secret).
5. Trigger fake events: `stripe trigger checkout.session.completed`, `stripe trigger customer.subscription.deleted`, etc.

Production webhook: Stripe Dashboard → Developers → Webhooks → Add endpoint at `https://<domain>/api/webhooks/stripe`. Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy that endpoint's signing secret into Vercel env as `STRIPE_WEBHOOK_SECRET` (separate from the local one).

`getStripe()` from `src/lib/stripe.ts` is a server-only singleton. Like `supabase-admin.ts`, never import it from a `"use client"` file — `STRIPE_SECRET_KEY` is not `NEXT_PUBLIC_*`, so a stray client import resolves the env to `undefined` and `getStripe()` throws fast rather than silently misbehaving.

# Operational toggles

## PILOT_MODE

`PILOT_MODE=true` flips the app into **free pilot mode**:

- The subscription gate at `/app` returns `{ kind: "allow_with_warning", reason: "pilot_mode" }` — bypassing Stripe entirely. Any logged-in user reaches the dashboard regardless of subscription state.
- A mint (`--brand-tint`, per DESIGN.md) `PilotBanner` is rendered above the dashboard explaining the pilot.
- `/subscribe` hides the Subscribe button and shows a "Continue to dashboard →" link instead (the page itself remains so old links still resolve).
- The landing page CTA copy switches from "Start your free week" / "First week free" to "Join the pilot" / "Free during the pilot. Plans from €5.99/month after."
- Pricing is three flat monthly plans per company, prices excl. VAT (Light €5.99 / 15 receipts, Regular €14.99 / 50, Heavy €29.99 / 150 — see `src/lib/plans.ts`), plus €0.40 per receipt above the allowance. Every server-created receipt is counted once in `public.receipt_usage` by `recordReceiptUsage()` (`src/lib/usage.ts`); new receipt-creating routes must call it. Deleting a receipt never gives the allowance back. Receipts above the allowance on an **active** (not trialing) subscription are reported to a Stripe Billing Meter when `STRIPE_METER_EVENT_NAME` is set, and charged through the metered `STRIPE_PRICE_OVERAGE` that `/api/checkout` adds to every subscription. Saving a receipt is never blocked. **Before turning `PILOT_MODE` off**, create the three plan prices (tax behaviour: exclusive), the meter and the overage price in Stripe and set `STRIPE_PRICE_LIGHT` / `_REGULAR` / `_HEAVY`, `STRIPE_METER_EVENT_NAME` and `STRIPE_PRICE_OVERAGE` in Vercel — otherwise checkout refuses with "This plan isn't available yet".
- `/admin`, `/auth/callback`, `/api/webhooks/stripe`, `/api/checkout` are **unchanged**. Pilot mode only affects the customer-facing gate and copy.

## SHOW_PRICES

`SHOW_PRICES` in `src/lib/pricing-visibility.ts` (off since 2026-11-08, pricing model under review) decides whether the public marketing site names prices: the landing pricing section and its nav/footer links, the price notes under the hero buttons, the FAQ cost answer, the fact sheets, the JSON-LD offers (a free pilot offer only while `PILOT_MODE` is on), `/llms.txt` and `/llms-full.txt`. Off, every surface uses its price-free wording, and a test fails if a plan price leaks into any of them. `/subscribe`, Checkout and the in-app usage screens always show the real prices from `plans.ts`. Flip it back to `true` once the pricing is settled.

When `PILOT_MODE` is unset or set to anything other than the literal string `"true"`, the app behaves as paid (current state). `src/lib/pilot.ts` exposes `isPilotMode()` — server-only; the literal-`"true"` compare is intentional so a typo defaults safely to charging.

To flip back to paid: in Vercel → Settings → Environment Variables, remove `PILOT_MODE` (or set to `false`) and redeploy. Existing pilot users without subscription rows will hit the gate's `redirect_subscribe` branch and need a separate "pilot ended, here's your subscribe link" email.

## OCR (Claude vision auto-extract)

`/api/ocr` accepts a receipt image and returns extracted fields (merchant, amount, currency, date, category, etc.) via Claude vision. The customer-side `CaptureDialog` and the founder-side `/admin/[userId]` paste form both POST to it on photo pick and pre-fill empty form fields with the result.

- `src/lib/ocr.ts` exposes `extractReceipt(imageBase64, mediaType)`. Server-only; never import from `"use client"`. Uses prompt caching on the system message — the JSON schema is reused across every call so cached tokens are ~90% cheaper.
- `/api/ocr` is auth-gated via `getServerUser()` and `hasProductAccess()`, accepts `image/jpeg|png|webp` and `application/pdf` (max 10 pages), capped at 4 MB (`src/lib/receipts/upload-limits.ts` — Vercel rejects bodies over 4.5 MB anyway), runs on Node.js with `maxDuration = 30`. The capture dialog shrinks photos in the browser first (`src/lib/image-resize.ts`).
- `/api/ocr`, `/api/receipts/[id]/reprocess`, `/api/capture` and `/api/intake/email` are rate-limited per user (per alias for email) via `rateLimit()` in `src/lib/rate-limit.ts`, backed by `public.rate_limit_hit()`. Any new route that calls Claude or writes to storage must call it too. It fails open if the counter errors; the Anthropic console spend cap is the hard backstop.
- Email receipts (`/api/intake/email`) are marked verified from a template (Uber, Stripe) only when Resend's DMARC verdict passes, the sender is the template's own domain, and the message's single To: header (read from the raw .eml; a repeated To: or a Cc: never counts) names one of the user's own inboxes (sign-in email or `user_email_addresses`, managed on `/app/settings/forwarding`). A receipt sent straight to the forwarding alias is never trusted as-is: Uber and Stripe let anyone type any receipt address. Without the raw .eml, or when its header block can't be read in full, nothing is trusted. Everything else lands in Review needed and isn't billed until confirmed.
- Gmail's "confirm this forwarding address" email (DMARC pass, `forwarding-noreply@google.com`) is not a receipt: its code is kept for the setup guide (`email_forwarding_confirmations`). When the Gmail account asking to forward is one of the user's own inboxes (sign-in email or `user_email_addresses`), intake also confirms it for them by POSTing Gmail's link on `mail.google.com/mail/vf-…` (`src/lib/forwarding-autoconfirm.ts`, that host and path only) and sets `auto_confirmed_at`; the guide then skips typing the code but still shows it as a fallback. A request from any other Gmail account is never confirmed: anyone who knows an alias can trigger one. The guide (`/app/settings/forwarding`) starts on Gmail or Outlook when the sign-in email's domain says which.
- A forwarded email that carries a PDF or photo (`src/lib/email/attachments.ts`: nested MIME, base64/quoted-printable, same type and 4 MB rules as uploads, PDF page cap) is read by Claude OCR from that attachment instead of the text, unless a trusted template already read the mail; when OCR read it, the attachment is stored as the receipt's original (byte for byte) and the message itself is kept next to it as `<id>.eml` (deleted with the row); otherwise the .eml stays the original (it contains the attachment). The fields land in Review needed like any untrusted extraction. OCR failure falls back to the text parser.
- The OCR step runs BEFORE `/api/capture` and is best-effort — failures fall back silently to manual entry. The capture sheet calls `/api/ocr?stream=1`: newline-delimited JSON with `partial` form fields as they are read (total and date after ~1.3 s), then `result` or `error`; the sheet sends `GET /api/ocr` when it opens to warm the function. In stream mode `/api/ocr` also stores the photo under `<user_id>/staged/` and sends its path (`staged` line), so Save posts `staged_image` instead of uploading the photo again; `/api/capture` accepts only the user's own staged path and moves it to the receipt's path (409 when it's gone; the sheet then sends the photo). Unsaved staged photos are deleted after 24 h. OCR creates no receipt; `/api/capture` and the admin routes still handle saves.

Required env var: `ANTHROPIC_API_KEY` (see `.env.example`). Server-only, not `NEXT_PUBLIC_*` — an accidental client import resolves to `undefined` and `getClient()` throws fast.

# Scheduled jobs

`vercel.json` schedules five daily Vercel Cron jobs (Hobby allows one run per day, ±59 min). Each route calls `isAuthorizedCron()` (`src/lib/cron-auth.ts`), which requires `Authorization: Bearer $CRON_SECRET` and refuses everything when `CRON_SECRET` is unset.

- `/api/cron/cleanup-exports` — deletes accountant exports older than 24 h from the private `exports` bucket, Gmail forwarding confirmation codes (`email_forwarding_confirmations`) older than 7 days, and staged capture photos (`receipts/<user_id>/staged/`, `src/lib/receipts/staging.ts`) older than 24 h.
- `/api/cron/retention` — `src/lib/retention.ts`. Does nothing while `PILOT_MODE` is on. When every subscription of an account has ended (`subscriptions.ended_at`, set by the Stripe webhook), it emails a reminder 14 days before day 90 and deletes the account (`deleteAccount(…, { refuseIfLive: true })`) on day 90. The clock runs from the later of the cancellation and the last receipt (auto-forwarded receipts mean the account is in use). Each candidate is re-checked on its own right before acting; deletion never happens without a recorded reminder for that clock date (`account_retention`) and never sooner than 14 days after it. Users without a subscription row are never touched; admin accounts are skipped. This implements the privacy page's "How long we keep it"; change both together.
- `/api/cron/overage-sweep` — `sweepUnbilledOverage()` in `src/lib/usage.ts` re-reports this period's extra receipts whose meter call failed. Stripe dedupes a meter event `identifier` for only "at least 24 hours", so every report sets `receipt_usage.overage_attempted_at` on its first attempt (never moved by retries) and the sweep retries automatically only within 20 h of that first attempt; older unconfirmed rows go to Sentry for a manual check.
- `/api/cron/weekly-reminders` — `runWeeklyReminders()` in `src/lib/reminders/weekly.ts` (firm portal rule 7). Runs daily at 06:10 UTC but sends only Monday to Wednesday in Stockholm: Monday normally, the next two days pick up what a timeout (45 s budget) or a failed send left. At most one email per company per ISO week.
- `/api/cron/signup-digest` — `runSignupDigest()` in `src/lib/signup-digest.ts` emails the founder (first `CONCIERGE_ADMIN_EMAILS` address) the accounts and waitlist entries created in the 24 hours before the start of the current UTC hour, with each account's progress and a pre-filled outreach link (only for confirmed addresses). Nothing is sent on a day without sign-ups; admin accounts are left out. Runs at 19:00 UTC; Hobby fires within that hour, so consecutive windows meet exactly.

# Exports and account deletion

- `POST /api/export` (period `YYYY-MM`, `YYYY` or `all`, max 1,000 receipts) builds a ZIP (receipts.csv, PDFs, originals, edit-history.json) into the private `exports` bucket, replacing the user's previous export, and returns 15-minute signed URLs — Vercel caps a function response at 4.5 MB. Parts stay under 40 MB because Supabase Free caps a stored file at 50 MB. Not subscription-gated: cancelled customers must be able to take their data.
- `POST /api/firm/clients/[orgId]/export` is the firm's version of the same (`buildExport()` with an `organization` scope, from `requireFirmClientAccess()`): the ZIP also holds `bookkeeping.csv` (one line per receipt and VAT rate, BAS suggestion from `src/lib/bookkeeping/bas-map.ts` unless `receipts.bas_account` is set, input-VAT account 2640). By default only receipts with `exported_at IS NULL` are included and they are stamped `exported_at`/`exported_by` once the last upload succeeded; a re-export never moves the stamp. Files are `exports/<actor>/<scope>-<stamp>-<label>.zip`; `self-…` for a customer's own export, the organisation id for a firm's, so one client's export never deletes another's link. The BAS defaults are standard BAS 2026 values still to be confirmed by the pilot accountant.
- `POST /api/account/delete` (needs this session's sign-in, from the token's `amr`, within 30 min) and the retention job both call `deleteAccount()` (`src/lib/account-deletion.ts`): cancel every chargeable Stripe subscription of the user's customers (asked from Stripe, not just our rows), remove every file under `<user_id>/` in `USER_FILE_BUCKETS`, delete receipts, then the auth user (the rest cascades). A new bucket holding user files must be added to `USER_FILE_BUCKETS`. Organisations, memberships and firm links (2026-11-04 block) cascade from `auth.users`: deleting a client removes their default organisation and its firm link; deleting a firm member never touches any client's data, and the firm is settled first by `src/lib/firm/account-exit.ts`: if they were its only admin, the colleague who joined first becomes admin; if nobody else has signed in to the firm, the firm is deleted with its pending invites and client links (a stranded link would stop the client from linking another accountant), and every owner of each linked company is emailed that the firm no longer sees their receipts (`sendFirmClosedNotices()`, `src/lib/firm/link-emails.ts`, best effort). Firm staff without a company of their own delete from `/firm/settings`; anyone with a company deletes from `/app/settings`, after the export. Firm-only staff have no `subscriptions` rows, so the retention job never selects them; an accountant who also had a company of their own can be selected, and then `deleteAccount(…, { refuseIfLive: true })` refuses (Sentry) instead of settling the firm unattended.

# Store apps

One Capacitor app wraps `app.unreceipt.com` for both roles (plan: `docs/plans/unreceipt-store-apps-plan.md`). The shell appends `UnReceiptApp/<version> (ios|android)` to the user agent; `parseNativeApp()` (`src/lib/native-app.ts`, client-safe) and `getNativeApp()` (`src/lib/native-app-server.ts`) read it.

- The store apps sell nothing and point to no purchase elsewhere (App Store 3.1.3(f); the same rule on Android). Inside the app: no prices, plan suggestions, trial copy, "subscribe" or links to the marketing site; `/subscribe` shows a neutral screen and `/api/checkout` answers 403. Any new surface that mentions prices or plans must take the same native variant.
- The user agent is display-only. Never use it for access, limits or anything a user gains by faking it.
- The iOS project is `ios/` (Swift Package Manager), configured in `capacitor.config.ts`; how to run it: `native/README.md`. `server.url` must stay the bare origin (`https://app.unreceipt.com`, start page via `appStartPath`): Capacitor keeps a link inside the app only when it starts with that URL, and opens everything else in Safari. Every page inside the app gets the native bridge (`window.Capacitor` and every plugin), and that prefix check alone would also accept look-alikes such as `app.unreceipt.com.evil.com`, so `NavigationGuardPlugin` (`ios/App/App/NavigationGuardPlugin.swift`) keeps only the exact host (scheme, host, port) inside the app. Never iframe third-party HTML in the app either: any frame can post to the bridge. Release builds refuse to build unless `capacitor.config.json` points at production (Xcode build phase). Debug builds use the bundle ID `com.unreceipt.app.dev`; release builds `com.unreceipt.app`. `APP_VERSION` in `capacitor.config.ts` must match the Xcode version.
- Inside the app the service worker isn't registered (`_client-shell.tsx`), and `NativeAppBridge` (root layout) hides the splash once the page has painted.
- Downloads: the iOS web view ignores `<a download>`, so `NativeAppBridge` hands every `a[download]` click to `DownloadsPlugin` (`ios/App/App/DownloadsPlugin.swift`), which fetches the file and opens the share sheet. A new download only needs a plain `<a href download>`. The plugin fetches only the app's own server (with the web view's cookies for that host; renewed sign-in cookies in the response are copied back into the web view) and this project's Supabase Storage (`plugins.Downloads.storageHost` in `capacitor.config.ts`, no cookies). It uses its own cookie-less session, and a redirect must stay with the same kind of address. Widen the list deliberately, never to any host. `blob:` and `data:` links are left to the web view. Safety net: `WebViewDelegateProxy` (`ios/App/App/WebViewDelegateProxy.swift`) sits in front of Capacitor's navigation delegate; a main-frame response that is a file (attachment, PDF, ZIP, image) is cancelled and sent to `DownloadsPlugin`, and a deliberately cancelled load never shows the offline page (Capacitor's handler loads it for every failure).

# Region

`vercel.json` pins serverless functions to `fra1` (Frankfurt), next to the Supabase project (`eu-central-1`). Every request makes several database round-trips, so keeping them in the same region matters for latency, and it keeps processing in the EU. Don't add regions without moving the database too.

# Hosts

Two hosts, one Next.js app:

- `unreceipt.com` (apex) — marketing only: `/`, `/sv`, `/fr`, `/privacy`, `/api/waitlist`. Pure website; no manifest, no service worker, no install prompt.
- `app.unreceipt.com` — product: `/app/*`, `/admin/*`, `/subscribe`, `/auth/*`, `/api/checkout`, `/api/webhooks/*`, `/api/admin/*`. PWA-installable.
- `/demo` (on the app host) — the public guided tour: `/demo/company` and `/demo/accountant` render the real screens with sample data, and every `/api` call is answered in the browser, so nothing reaches the database, Resend or Claude. Keep it that way: a demo component must never call a real route. Linked from the landing hero.
- `www.unreceipt.com` — 308 → apex via `next.config.ts redirects()`.

`proxy.ts` enforces the split with 308 redirects when a request lands on the wrong host. Local dev (`localhost`, `127.*`) and Vercel previews (`*.vercel.app`) sit outside the apex/app split, so both surfaces remain reachable on the same origin.

Cross-host links from marketing to product use `appUrl(path)` from `src/lib/app-url.ts`. Server callers respect `NEXT_PUBLIC_APP_URL` (set on Vercel for Production AND Preview); browser callers detect dev/preview origins and fall back to a relative path so localhost still works without the env var.

PWA assets (manifest, apple-touch-icon, mobile-web-app meta) only render in `app/layout.tsx` when the host matches the product subdomain or a dev/preview origin. Service-worker registration in `_client-shell.tsx` follows the same rule.

Stripe Checkout `success_url` / `cancel_url` use `NEXT_PUBLIC_APP_URL` so the customer always returns to the product host regardless of which host received the POST.

# Languages

The marketing site has three languages: English at `/`, Swedish at `/sv` and French at `/fr`. The product (`app.unreceipt.com`) is English only.

- Every page renders the same `LandingPage` component with a `locale` prop. Every visible string lives in `src/app/_landing-copy.ts` (fixed-length tuples keep the languages in step), including the example receipts (Swedish shops in kronor on `/` and `/sv`, French shops in euros on `/fr`); the scrolling receipt's text is in `src/app/_receipt-backdrop.tsx`; FAQ answers live in `src/lib/faq.ts`; prices come from `src/lib/plans.ts` (`planPriceLabel()` shows `€5.99` on `/`, `69 kr` on `/sv`, `5,99 €` on `/fr`). Language names for the switch are in `src/lib/locale.ts`.
- Questions about one country's rules (receipt retention, paper originals) belong on that country's language page; the English FAQ stays general.
- Each landing page declares `alternates.languages` (hreflang) for every language plus `x-default` → `/`, and the sitemap lists every URL with the same alternates. A new language needs a page, a copy entry, receipt text, FAQ answers, an entry in `LOCALES`, and its paths in `MARKETING_PAGES` (sitemap, hreflang and the proxy follow from there).
- The root layout always renders `<html lang="en">` because it can't see the pathname; `/sv` and `/fr` correct it after hydration with `HtmlLang` (`src/app/_html-lang.tsx`). Search engines read the language from hreflang and the content.
- Beyond the landing pages, the marketing site has audience pages (accounting firms: `/accountants`, `/sv/redovisningsbyra`, `/fr/experts-comptables`; freelancers and sole traders: `/freelancers`, `/sv/enskild-firma`, `/fr/independants`) and guides (one country's law per page). Every marketing path is registered once in `MARKETING_PAGES` (`src/lib/marketing-pages.ts`), which feeds the sitemap, hreflang, the footer and `APEX_ONLY_EXACT` in `proxy.ts`; a test fails if a registered path has no `page.tsx`. Audience copy is in `src/app/_audience-copy.ts`, guides with their sources in `src/lib/guides.ts`, header/footer in `src/app/_site-chrome.tsx`. Every page builds its metadata with `marketingMetadata()` (`src/lib/seo.ts`) so none loses the share image. Guides cite their legal sources and a review date: re-check them, bump `updated` and the page's `lastModified` when a rule changes (LPF L102 B becomes 10 years on 2027-01-01). Those pages are server components; never call `buttonVariants()` there (it lives in a client module). For AI assistants: `/about` (+ `/sv/om-unreceipt`, `/fr/a-propos`, facts in `src/lib/about.ts`, limits included and kept true), `/llms.txt` and `/llms-full.txt` (built from the same sources), `robots.ts` names the AI crawlers, and IndexNow (`src/lib/indexnow.ts`, key file in `public/`, `node scripts/indexnow.mjs` after a deploy that changes marketing pages).
- Paper originals differ by country: the Swedish FAQ says they may be thrown away once digitised (with the BFL 7 kap. conditions), the French FAQ says to keep them because UnReceipt doesn't produce the *copie conforme* that LPF art. A102 B-2 requires for paper invoices. Change both if the product starts keeping untouched originals.

# Design System

`DESIGN.md` at the repo root is the source of truth for the product surface (`app.unreceipt.com` + Capacitor wrapper). Read it before any visual / UI work.

Rules:

- All color tokens, typography choices, spacing, motion, border radius, and component-level specs live in `DESIGN.md`. Do not introduce new tokens, fonts, or one-off colors without updating `DESIGN.md` first.
- The font stack is **Manrope (display) + Figtree (body) + Geist Mono (amounts only)**. Mono is reserved for monetary values; never use it for body or labels.
- The page background is `--surface: #FAFAF7` (cream, paper-feel). The mint `--brand-tint: #ECF7E7` is reserved for empty-state hero, pilot banner, and the VAT-summary panel — never the page background.
- Cards have a `1px --hairline` border and no drop shadow. The FAB is the only place a drop shadow exists.
- The signature elements are the `Un` wordmark (mono `Un` tag + Manrope `Receipt`) and the perforated edge motif at the top of receipt detail views. Reuse the shared `Wordmark` and `PerfEdge` components rather than re-implementing.
- `/admin/*`, `/subscribe`, Stripe Checkout, and the marketing landing at `unreceipt.com/` are out of scope for the design system. Token changes will ripple to them but do not redesign their layouts.
- In QA / design-review mode, flag any code that violates `DESIGN.md` (off-token colors, wrong fonts on amounts, shadows on cards, mint backgrounds outside the allowed surfaces).

# Error monitoring

Sentry (`@sentry/nextjs`) loads from `src/instrumentation.ts` (server/edge) and `src/instrumentation-client.ts` (browser), with options in `src/lib/sentry-options.ts`. It is a no-op unless `NEXT_PUBLIC_SENTRY_DSN` is set. Events are scrubbed of request bodies, cookies, headers, query strings and user details; session replay is off because it would record receipt contents. Report unexpected failures with `Sentry.captureException(err, { tags: { area } })` next to the `console.error`, and never put receipt contents, emails or names in `extra`.

# Review agents

`.claude/agents/` holds three read-only reviewers. Run the matching one on a diff before committing:

- `security-reviewer`: anything under `src/app/api/**`, `src/lib/**`, `proxy.ts`, `next.config.ts`, `supabase/**`.
- `design-reviewer`: anything under `src/app/app/**`, `src/components/**`, `globals.css`.
- `compliance-reviewer`: extraction, the compliance rules config, the proof PDF, retention/deletion.

They report findings with `file:line`. Fix what survives verification; don't commit around a HIGH finding.
