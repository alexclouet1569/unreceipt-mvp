# UnReceipt — Hand-off for Step 2 (paste this into a new chat)

You are continuing work on **UnReceipt**: a receipt app for Swedish small businesses.
- **Capture:** forward an email, snap a photo, or upload a PDF.
- **Extraction:** Claude pulls out merchant, VAT and line items.
- **Output:** a VAT-ready digital receipt and a PDF.

Repository: `alexclouet1569/unreceipt-mvp`. The two other repos (`unreceipt-email`, `unreceipt-email-mvp`) are empty; ignore them.

**Rule for this chat: don't guess.**
- If something below isn't confirmed by the code, the repo docs or a tool result, check it before acting.
- If you can't check it, say so.
- The user wants honest, critical answers, not agreement.
- The user is not a developer. Give them exact step-by-step instructions for anything they must do: Supabase, Vercel, Stripe, GitHub.

---

## 1. Read these first (in the repo)

1. `AGENTS.md`: project rules. It covers the database conventions, admin auth, Stripe, pilot mode, OCR, rate limits, receipt usage, region, hosts, design system, Sentry, and the review agents.
2. `DESIGN.md`: the source of truth for every product UI (`app.unreceipt.com`).
3. `docs/plans/unreceipt-launch-plan.md`: the 120-action launch plan, with decisions D1–D7, pricing (§1a) and the phases. Checked boxes are done.
4. `node_modules/next/dist/docs/`: **this is Next.js 16.4**. APIs differ from older versions, so read the guide before writing Next code.

## 2. Stack and environment (verified 2026-10-15)

**Stack**
- **App:** Next.js 16.4.1 (App Router), React 19, Tailwind 4, shadcn, Vitest and Playwright. Installs use **npm** (`package-lock.json`); bun is not used.
- **Database / auth / storage:** Supabase project **`zkomfxvyrtkwxzvbxxma`** ("Unreceipt"), region `eu-central-1`.
  - `supabase/schema.sql` is canonical.
  - Every schema change is appended under a dated header **and** saved as `supabase/migrations/YYYYMMDD_name.sql`.
  - **The user applies SQL himself** in the Supabase SQL Editor. Give him the file names and the order.
- **Hosting:** Vercel. Functions are pinned to `fra1` by `vercel.json`.
- **Hosts:** `unreceipt.com` (marketing) and `app.unreceipt.com` (product).
- **Other services:**
  - Stripe: billing.
  - Resend: outbound email and inbound forwarding (`receipts+<hash>@in.unreceipt.com`).
  - Anthropic Claude: OCR and extraction (`src/lib/ocr.ts`, `src/lib/receipts/llm-extract.ts`).
  - Sentry: wired up but off until `NEXT_PUBLIC_SENTRY_DSN` is set.
- **Pilot mode:** production runs with `PILOT_MODE=true`, so nobody is charged.

**Tool access in this environment**
- **Supabase MCP works** (read-only SQL and advisors are fine).
- **The Vercel MCP gets 403** on this project. Ask the user for deploy logs if you need them.
- **This sandbox can't reach `unreceipt.com`.** Use Firecrawl to fetch pages, or securityheaders.com to check response headers.
- **Chromium is at `/opt/pw-browsers/chromium`.** Use `executablePath`; don't run `playwright install`.
- **Never** `pkill -f` or `pgrep -f` with a pattern that also appears in your own command line: it kills your own shell. Stop a dev server by PID from `ss -ltnp`.

## 3. State of the repo

**Merged to `main`**
- **#67, launch plan and Phase 1 security:**
  - Fixes: subscription-takeover fix, Next upgrade, `requireAdminPage`, Postgres rate limits (`src/lib/rate-limit.ts`).
  - Gates: `hasProductAccess` on paid API routes.
  - Receipt rules: per-user email dedupe; a model's self-reported confidence can't mark a receipt verified on its own; users can't write trust fields directly (REVOKE).
  - Hardening: security headers (A+), upload limits with photo resizing on the device, server-side delete, the Stripe webhook re-fetching subscriptions, Sentry, Dependabot and a CI audit step.
  - Product and docs: `/app/settings`, cream background, review agents, privacy page update.
- **#66 and #76:** the landing page plus the first flat plans; a Search Console tag.

**Open: PR #77, "Pricing v2".** Step 2 starts **after it is merged**. It contains:
- **Plans:** Light €5.99 / 15 receipts, Regular €14.99 / 50, Heavy €29.99 / 150, then €0.40 per extra receipt. All excl. VAT. Defined in `src/lib/plans.ts`.
- **Usage ledger:** `public.receipt_usage` and `src/lib/usage.ts`.
  - `recordReceiptUsage()` is called from capture, admin paste, verified email intake, and PATCH when a pending receipt is confirmed.
  - Deleting a receipt never gives the allowance back.
  - Extras on an **active** subscription go to a Stripe Billing Meter (identifier `receipt_<id>`), capped at 300 per period.
  - Nothing is billed during the trial, or when the subscription lacks the metered price (`subscriptions.overage_enabled`).
- **Checkout:** requires a billing address, collects the VAT number, and adds the metered overage item.
- **Webhook and self-heal:** store `plan`, `current_period_start` and `overage_enabled`.
- **Usage UI:** a meter in Settings (`UsageMeter`), a notice on the dashboard from 80% of the allowance (`UsageNoticeBanner`), and amounts in mono via `<Money>`.
- **`/admin`:** a payments go-live checklist (`src/lib/payments-readiness.ts`).
- **RLS speed fix:** `(select auth.uid())` in the access rules.
- **Deploy order for #77: SQL first**, then merge.
  1. `supabase/migrations/20261015_receipt_usage.sql`
  2. `supabase/migrations/20261015_rls_initplan.sql`

  The webhook writes the new columns, so the SQL has to exist before the code.

**Open issue: #80, "BEFORE TAKING PAYMENTS: set up Stripe".** This is the user's go-live checklist for Stripe and VAT. **Never** suggest turning `PILOT_MODE` off while #80 is open.

## 4. Decisions already made (don't re-open)

- **D1, pricing:** the flat per-company plans above, sized by receipts, with €0.40 overage. Saving a receipt is never blocked. Re-size after 3 months of pilot data (P2).
- **D2, mobile:** a Capacitor shell around `app.unreceipt.com` plus native plugins (Phase 4, not this step).
- **D3, email:** forwarding plus guided auto-forward rules now; Outlook and Gmail OAuth later.
- **D4, photos:** iOS scans the photo library on the device; Android uses the photo picker (Phase 5).
- **D5, payment nudge:** an iOS Wallet automation with an App Intent (Phase 5).
- **D6, integrations:** Fortnox first, Findity in parallel; France is Launch 3.
- **D7, background:** cream `#FAFAF7`; mint only on the allowed surfaces.
- **Terms of service: WAIT for the user's lawyer.** Do **not** write or publish terms (action 46 is on hold).
- **Swedish translation:** a separate PR after Step 2 (actions 49–50).

## 5. Step 2 = "PR A: core product completeness"

One action per commit; one PR for the batch. Mark each action `[x]` in the launch plan when it's done.

1. **(40) Keep VAT from photo OCR.**
   - Today `CaptureDialog` and the `CaptureSchema` in `/api/capture` drop `tax_amount`, `tax_rate` and `payment_method`, even though OCR returns them.
   - Carry them through, validated with zod, and show them in the form.
2. **(41) Edit verified receipts.**
   - Today `PATCH /api/receipts/[id]` returns **409** for verified rows on purpose.
   - Add `receipts.edited_at`, plus `edited_fields` if useful. Allow editing.
   - Show "Edited by you on <date>" on the detail view **and the PDF** (`src/components/receipt/ReceiptPdf.tsx`).
   - The original file stays untouched. Writes go through the service role, scoped by `user_id`, as PATCH does today.
3. **(42) Make VAT, payment method and line items editable** in that same edit flow.
4. **(43) Check iPhone HEIC end to end.**
   - The upload allowlist is jpeg/png/webp/pdf (`src/lib/receipts/upload-limits.ts`).
   - `prepareImageForUpload` re-encodes to JPEG when the browser can decode the file.
   - Confirm what happens when it can't, and give a clear error.
5. **(44) In-app account deletion.** This is an App Store requirement.
   - In Settings: a "Download your data first" step, then type-to-confirm.
   - Server route:
     - cancel the Stripe subscription if there is one;
     - delete the storage objects under `<user_id>/` in both buckets `receipts` and `receipt-originals`;
     - delete the rows, then `auth.admin.deleteUser`.
   - `receipt_usage` cascades through the foreign key on `auth.users`.
   - Rate-limit the route, and require a fresh session.
6. **(45) Monthly export:** a ZIP of PDFs and originals, plus a CSV, for the accountant.
   - **Constraint:** Vercel function payload limits (about 4.5 MB). Check the current Vercel docs, then build the ZIP into a **private** storage bucket and return a short-lived signed URL rather than streaming a big body.
   - Rate-limit it.
7. **(58) Retention job.**
   - A Vercel Cron route protected by `CRON_SECRET`.
   - 90 days after cancellation, delete the account and its data.
   - Send a reminder email about 14 days before (Resend, `src/lib/email/`).
   - This must match `src/app/privacy/page.tsx`. Check the text before writing the code.
8. **(47) First-run onboarding in 3 screens:** your forwarding address → snap your first receipt → done. Follow DESIGN.md.
9. **(P5) Daily overage retry sweep.**
   - Re-report `receipt_usage` rows above the allowance where `overage_billed_at IS NULL` on active subscriptions with `overage_enabled`.
   - It's safe to repeat because Stripe dedupes on `receipt_<id>`.
   - Can share the cron infrastructure with item 7.

**Out of scope for Step 2:**
- terms page (lawyer);
- Swedish UI;
- native apps;
- Gmail/Outlook OAuth;
- integrations;
- company/multi-user accounts.

## 6. How to work (repo rules that bite)

**Checks**
- Before every commit run `npx tsc --noEmit`, `npm run lint` (0 errors), `npx vitest run`, and `next build` when routes change.
- Delete `.next` before `tsc` if you built locally; stale route types cause false errors.

**Review agents** (in `.claude/agents/`; run the matching one before the PR and fix what survives verification)
- `security-reviewer`: API, lib, SQL.
- `design-reviewer`: product UI.
- `compliance-reviewer`: extraction, PDF, retention/deletion. This one is needed for items 5–7.

**SQL**
- Idempotent statements, appended under a dated header plus a migration file.
- RLS on private tables; server-only writes get no write policies.
- Revoke writes from `anon`/`authenticated` on server-only tables.
- In the PR, state the deploy order (SQL before or after merge) and why.

**API routes**
- **Auth and admin:** `getServerUser()`. Admin pages call `requireAdminPage()`; admin APIs call `requireAdmin()`.
- **Claude and storage:** any route that calls Claude or writes to storage calls `rateLimit()` (add a rule in `RATE_LIMITS`). Paid customer routes also call `hasProductAccess()`.
- **New receipts:** any route that creates receipts calls `recordReceiptUsage()`. Never block saving a receipt.
- **Errors:** generic messages to the client. Log details server-side and call `Sentry.captureException(err, { tags: { area } })`.
- **Personal data:** never put email addresses, names or receipt contents in logs or Sentry `extra`.

**Service role**
- The service-role client (`getSupabaseAdmin`) and `getStripe` are server-only. Never import them from `"use client"` files.

**UI** (DESIGN.md)
- Money is always Geist Mono (use `<Money>`).
- Cards: 1px hairline border, no shadow.
- Mint only on the empty-state hero, pilot banner and VAT panel.
- "Attention" honey tokens for warnings; red only for destructive actions.
- 44 px tap targets; mobile-first at 390 px.

**Git and PRs**
- Develop on the branch this session's instructions give you.
- If that branch's previous PR is merged, restart it from the latest `main`.
- Commit message footers come from the session instructions.
- Open a PR only when the user asks or has already agreed (they want **one PR per step**). Give it a clear description and the deploy steps.

## 7. Things only the user can do (remind him; don't nag)

- **Payments:** issue #80, all Stripe setup, before `PILOT_MODE` goes off.
- **Before merging #77:** run its two SQL files.
- **Supabase leaked-password protection:** needs the Pro plan; he'll do it later.
- **Accounts:** D-U-N-S number, Apple Developer (organization) and Google Play (organization) accounts. Needed for Phase 4.
- **Anthropic:** a monthly spend cap in the console.
- **DPAs:** accept them in the Supabase, Vercel, Resend and Stripe dashboards.
- **Optional:** a Sentry EU project, with its DSN set as `NEXT_PUBLIC_SENTRY_DSN` in Vercel.
- **Lawyer:** terms of service, and a check of the "copie fiable" rules for France later.

## 8. Known open risks (tracked in the plan)

- **(85a) Spoofed vendor emails:** a fake email that fully matches the Uber/Stripe template is trusted. Verifying inbound DKIM/SPF is needed before any automatic export to accounting.
- **(P3) No self-serve plan change** yet: the hint says "write to us". The Stripe customer portal comes later.
- **Assumed receipt volumes:** the per-claimant volumes behind the plan sizes are assumptions (12/27/62 receipts a year). `receipt_usage` will measure the real numbers.
