# UnReceipt — Implementation prompts (paste one at a time)

Each block below is a self-contained prompt. Paste it as the first message in a Conductor workspace pointed at `unreceipt-mvp` (or, if reusing the existing implementation workspace, as a new message after the previous PR lands).

Order matters: PR-fix-A and PR-fix-B clean the brand drift before any new feature lands on top of it, then steps 6 → 9 build out the remaining digital-receipt flow.

The reference plan that already informs steps 3–5 of the migration is:
`/Users/alexandreclouet/conductor/workspaces/gstack-ai-agent/warsaw/.context/plans/unreceipt-brand-and-digital-receipt.md`

The brand-book PDF (source of truth for color, type, logo) is:
`/Users/alexandreclouet/Documents/Startup /UnReceipt/UnReceipt Brand book Final.pdf`

---

## PR-fix-A — Realign app palette to the brand book

```
You are working in the unreceipt-mvp repo (Next.js + Tailwind + shadcn).

Goal: the app's CSS tokens have drifted from the locked brand book. Bring
them back. The marketing site (unreceipt.com) is already on-brand —
match the app to it.

Brand-book locked palette (pp. 12, source of truth):
  Green Mint   #27BE7B  — primary action / accent
  Deep Space   #303568  — text / headings / "Un" of the wordmark
  White Mist   #ECF7E7  — page background, tints
  Carbon       #191919  — pure-mono fallback only

What is wrong today in src/app/globals.css:
  --surface     is #FAFAF7  (should be #ECF7E7 White Mist)
  --ink-muted   is #5A5F7A  (not a brand-book token — invented for
                              "Nordic-Quiet Premium" which we're dropping)
  --ink-faint   is #9CA0B8  (same — drop)
  --hairline    is #E8E5DD  (same — drop or replace with a brand-book-
                              derived tint of Deep Space)
  --chart-3     is #171A2E  (should be Deep Space #303568)
  --chart-5     is #404375  (off-palette)
  sidebar-foreground and sidebar-accent-foreground are #171A2E (should
    be Deep Space #303568)

What to do:
1. Edit src/app/globals.css:
   - --surface           → #ECF7E7
   - --background        → #ECF7E7
   - --foreground        → #303568  (already correct, verify)
   - replace --ink-muted, --ink-faint with one muted variant derived
     from Deep Space, e.g. --foreground-muted: rgba(48,53,104,0.65)
     Use this for "muted-foreground" everywhere it was --ink-muted.
   - --hairline          → rgba(48,53,104,0.12)  (Deep Space at low
     alpha — looks like a real divider on White Mist, brand-aligned)
   - --chart-3           → #303568
   - --chart-5           → drop and unmap if unused; otherwise use a
     Green Mint or Deep Space tint
   - sidebar tokens: foreground / accent-foreground → #303568
   - Update the trailing comment from "Nordic-Quiet Premium" to
     "Brand book pp. 12 — Green Mint, Deep Space, White Mist, Carbon".
2. Drop the dark-mode block at the bottom UNLESS the project actually
   ships a dark theme to users. Search for `dark:` class usages in JSX
   — if there are real ones, leave the block but realign its tokens to
   inverted brand-book colors (White Mist text on Deep Space surface).
   If there are no real dark: usages, delete the .dark block entirely
   and remove the @custom-variant dark declaration.
3. Run `git grep` for #FAFAF7, #5A5F7A, #E8E5DD, #9CA0B8, #171A2E,
   #404375 across src/. Every hit outside globals.css needs to be
   replaced with the corresponding brand-book token or removed. Do
   NOT mass-replace blindly — for each hit, read the surrounding code
   and pick the semantically correct token.
4. Visual smoke test: `pnpm dev` (or npm), open /app on localhost,
   then /signin and /demo. Pages should look subtly more green-tinted
   than before (because the surface is now White Mist, not Fafaf7).
   Take before/after screenshots and attach to the PR body.

Acceptance:
- `git grep -E "#FAFAF7|#5A5F7A|#E8E5DD|#9CA0B8|#171A2E|#404375"
  -- src/` returns zero hits.
- All shadcn surfaces (Card, Dialog, Sheet, Popover) render on White
  Mist with Deep Space text — verify in the browser.
- Existing tests still pass (`pnpm test` / `pnpm vitest`).
- PR title: `brand(fix-A): realign app palette to brand book (drop Nordic-Quiet drift)`

Out of scope (do not touch): font roles (separate PR), Wordmark
component (already correct), receipt feature code.
```

---

## PR-fix-B — Restore Manrope as body face, demote Figtree to italic accent

```
Goal: brand book pp. 15-16 lock Manrope as the primary face (body +
headings) and Figtree as the italic accent family for callouts, pull
quotes, and short descriptive notes only. Today they are swapped:
Figtree is body default and Manrope is only used on h1-h3 via a
"font-display" utility. Restore the brand-book hierarchy.

What to change:

1. src/app/layout.tsx — swap the CSS-var assignments:
   - Manrope → variable: "--font-sans"   (body default)
   - Figtree → variable: "--font-accent" (italic callouts only)
   - Geist_Mono stays as --font-mono (used for monetary amounts —
     leave it alone, that's a deliberate exception)

2. src/app/globals.css @theme inline block — update the bindings:
   - --font-sans:    var(--font-sans)        (was already var(--font-sans))
   - --font-display: var(--font-sans)        (display = sans = Manrope now;
                                              alternatively drop --font-display
                                              entirely and remove `font-display`
                                              utility usages — see step 3)
   - --font-accent:  var(--font-accent)      (Figtree)
   - --font-heading: var(--font-sans)        (already pointed at display, now
                                              redirect to sans)

3. Decide on font-display:
   - Option (preferred): drop --font-display from @theme and remove
     all `font-display` className occurrences across src/, replacing
     them with default body (no class). Since Manrope is now the body
     face, headings will render in Manrope without the explicit
     utility.
   - Option (defensive): keep --font-display pointed at Manrope so
     the existing `font-display` utility keeps working — no JSX
     changes needed. Pick this if there are >20 `font-display`
     usages and you want a smaller diff.

4. @layer base — the rule `h1, h2, h3 { font-family: var(--font-display) }`
   becomes redundant (or needs to point at --font-sans). Remove it if
   you chose the preferred option; update it otherwise.

5. Figtree italic accent — find callout / pull-quote / tagline
   components ("Paper is Past", "If it's not understood in seconds,
   it's not UnReceipt", etc.) and apply `font-accent italic` to those
   specific spots. Brand book p. 16: Figtree is for "short, punchy
   callouts, pull quotes, and brief descriptive notes."
   Likely candidates: marketing hero subtitle (if present in app),
   empty-state inbox subtitle, OG image text. Audit and update.

6. Mono exception: leave font-mono on monetary amounts as-is. That's
   intentional from PR2/8 and is consistent with the brand book's
   "Precision — Accuracy in every detail" core value.

Acceptance:
- Open /app — body text reads visibly different (more geometric,
  more confident than the friendlier Figtree). Side-by-side
  screenshot before/after in PR body.
- vitest + next build clean.
- `git grep "font-display"` and `git grep "--font-display"` are
  consistent (either both gone, or both pointing at Manrope).
- PR title: `brand(fix-B): restore Manrope as body face per brand book pp. 15-16`

Out of scope: tweaking line-height/letter-spacing (separate polish
pass), the Wordmark component (already uses Manrope ExtraBold
correctly via its SVG).
```

---

## Step 6 — Email forwarding intake

```
Implement step 6 of the plan at:
  /Users/alexandreclouet/conductor/workspaces/gstack-ai-agent/warsaw/
  .context/plans/unreceipt-brand-and-digital-receipt.md
(Part 2 §B1.) Steps 1-5 are merged. Steps fix-A and fix-B should land
before this one.

Goal: a forwarded email lands in the user's /app inbox as a new
digital_receipts row, with merchant / date / total parsed, raw .eml
retained in storage.

Pick the email provider FIRST and tell me before writing code. Options:
  (a) Resend Inbound — we already use Resend for outbound, adds one
      MX record per receiving domain
  (b) Postmark Inbound — separate vendor but mature inbound product
  (c) Cloudflare Email Workers — cheapest, more wiring
Default recommendation: Resend Inbound, fewer moving parts.

Address scheme — also confirm before code:
  Per-user unique alias: receipts+<user-id-hash>@in.unreceipt.com
  This avoids whitelist maintenance. The hash is stored on the user
  profile at signup. Mention this on /app empty state as the inbox
  address.

Implementation:

1. Add provider webhook handler at src/app/api/intake/email/route.ts:
   - Verify provider signature (use provider SDK or HMAC manually).
   - Parse the inbound payload: to, from, subject, text, html, .eml.
   - Resolve user_id from the to: alias (hash lookup against
     profiles table).
   - Compute intake_ref = Message-Id header. If absent, sha256 of
     the raw .eml.
   - Upsert by intake_ref. If a row exists, return 200 idempotently.
   - Store the raw .eml in Supabase Storage
     receipt-originals/{user_id}/{receipt_id}.eml (private bucket,
     RLS keyed on user_id).
   - Run parseReceipt({ kind: 'email', raw: payload }) from
     src/lib/receipts/parser.ts (built in step 5). If parser returns
     pending_review, insert with nullable canonical fields and
     status='pending_review'; otherwise insert filled row.
   - Return 200 with the inserted row id (provider needs 2xx to not
     retry).

2. Add a profiles.email_alias_hash column + migration. Generate at
   user signup (8-12 char random base32) and on profile read.
   Surface "Your forwarding address" on /app empty state and in
   account settings.

3. Tests (vitest):
   - Verifies signature check rejects unsigned requests.
   - Idempotency: same Message-Id POSTed twice creates one row.
   - Unknown to: address returns 404 without leaking which aliases
     are valid (return a generic body, log internally).
   - Parser failure (mock parseReceipt to throw) → row still
     inserted with status='pending_review'.

4. E2E playwright spec (skip in CI if it needs live mail):
   - Stub the webhook with a fixture .eml from a real receipt
     (Amazon, Uber, Stripe). Assert /app list shows a new row with
     correct merchant + total.

5. DNS: document the MX record + DKIM/SPF needed for in.unreceipt.com
   in a README section. Do NOT add to terraform / infra unless the
   project already has IaC for DNS — Alex sets these manually.

Acceptance:
- Forward a real Uber/Stripe receipt email to your test alias →
  within 30s row appears on /app with correct fields.
- Re-forward the same email → no duplicate.
- Pretend-attack: POST without signature → 401, no row inserted.
- PR title: `feat(step 6/9): email forwarding intake (Resend Inbound)`

Out of scope (next PR): SMS intake, PDF download.
```

---

## Step 7 — SMS forwarding intake

```
Implement step 7 of the plan (Part 2 §B2). Step 6 (email intake)
should be merged first since most of the scaffolding is shared.

Goal: a forwarded SMS lands in /app as a new digital_receipts row.

Provider: Twilio. We bind one Twilio number per user (paid path,
~$1/month/number) OR a single shared Twilio number with sender
phone-number lookup against profiles.phone (cheap path). Confirm
with me before writing code — recommendation: shared number, since
Swedish SMB market won't pay for a personal forwarding number.

Implementation:

1. Add profiles.phone column + verification flow (one-time SMS code
   on signup or settings). Required to use SMS intake.

2. Add webhook handler at src/app/api/intake/sms/route.ts:
   - Verify Twilio signature (X-Twilio-Signature header — use
     twilio.validateRequest).
   - Parse the inbound: From, Body, MessageSid, NumMedia.
   - Resolve user_id by From phone match against profiles.phone
     (E.164 normalized).
   - intake_ref = MessageSid.
   - If NumMedia > 0, fetch each media URL with the provider's
     basic-auth creds and store like a paper-intake image. Run
     parseReceipt({ kind: 'paper', raw: image }) via the existing
     OCR path.
   - Otherwise parseReceipt({ kind: 'sms', raw: Body }) on the text.
   - Same idempotent upsert + raw artifact retention as step 6.

3. Reuse the shared intake helper (extract a
   src/lib/receipts/intake.ts module from the email handler in
   step 6 if not already).

4. Tests + e2e mirror step 6.

Acceptance:
- Send a real bank tx-confirmation SMS to the Twilio number from a
  verified user phone → row appears.
- MMS with receipt photo → row appears with OCR-parsed fields.
- Unverified sender → 200 with no row inserted (don't leak which
  numbers are bound).
- PR title: `feat(step 7/9): SMS forwarding intake (Twilio)`
```

---

## Step 8 — PDF download endpoint (the headline feature)

```
Implement step 8 of the plan (Part 2 §E). This is the headline
feature: "people can download the digital receipt to use for
expense submission." Without this, the whole feature feels
incomplete.

Goal: GET /api/receipts/[id]/pdf streams a branded A4 PDF that is
visually equivalent to a paper receipt — usable as the supporting
document for any expense-report submission.

Stack: @react-pdf/renderer. Runs in Node runtime route handlers —
no headless browser, no external service, single dependency.

Implementation:

1. Install @react-pdf/renderer:
     pnpm add @react-pdf/renderer

2. Bundle the fonts (so PDF rendering is not OS-font-dependent):
   - Download Manrope and Figtree TTF/OTF files (already used as
     web fonts via next/font — pull the same files from Google
     Fonts mirror or vendor them in public/fonts/).
   - Register with Font.register({ family: 'Manrope', src: ... })
     for each weight used in the PDF (Regular, Medium, Bold,
     ExtraBold).

3. Create src/app/api/receipts/[id]/pdf/route.ts (Node runtime):
   - Auth: require session (createServerClient + getUser). 401
     if anon.
   - Query digital_receipts by id, RLS-checked by user_id (use the
     same supabase-server helper the rest of the app uses).
   - 404 if not found / not owned.
   - Render the PDF (component in step 4) via @react-pdf/renderer's
     renderToStream.
   - Return new Response(stream, { headers: {
       'Content-Type': 'application/pdf',
       'Content-Disposition':
         `attachment; filename="unreceipt-${slug(merchant)}-${date}.pdf"`,
       'Cache-Control': 'private, no-store',
     }})

4. Create src/components/receipt/ReceiptPdf.tsx — the PDF component.
   Layout per plan §E:
     Header band: Wordmark (left) + "Receipt #<id-short>" (right).
       Wordmark embedded as inline SVG (paste the same paths from
       src/components/brand/Wordmark.tsx, since SVG is
       portable). Colors: Green Mint #27BE7B + Deep Space #303568.
     Body block:
       Merchant, Date, Category — two-column label/value layout,
       Manrope Regular labels in Deep Space at 65% alpha,
       Manrope Medium values in Deep Space.
     Items table (optional, render only if items[] has rows).
     Totals block:
       Subtotal / VAT (rate%) / TOTAL — TOTAL line is Manrope Bold,
       large (24pt), tabular nums. Use Geist Mono if available in
       react-pdf, otherwise Manrope with tabular-nums OpenType
       feature.
     Footer: payment method, source-of-record reference
       (Message-Id / MessageSid / file hash), user notes.
     Disclaimer line (small, Manrope Regular, 60% alpha):
       "Captured by UnReceipt · unreceipt.com — This is a faithful
        digital copy of the original receipt; the original is
        retained on file."
     Page background White Mist #ECF7E7 with white inner card.

5. Add "Download" button to ReceiptDetailCard
   (src/components/receipt/ReceiptDetailCard.tsx) — Green Mint
   primary button, downloads to /api/receipts/{id}/pdf via plain
   anchor with download attr.

6. Tests:
   - vitest: route returns 401 anon, 404 wrong user, 200 + PDF
     content-type when owned.
   - vitest: PDF byte stream starts with %PDF-1.
   - Snapshot test of the React-PDF tree (not the binary) to catch
     layout regressions.
   - Playwright: log in, open a receipt detail, click Download,
     assert a PDF download event fires.

7. Manual QA checklist in PR body:
   - Download on desktop Chrome → opens in Preview.app cleanly.
   - Same on iOS Safari → opens in Files app, can be shared.
   - Fonts render (not Helvetica fallback).
   - Wordmark renders in correct colors.
   - Tabular nums align in totals block.
   - Filename is sanitized (no spaces, no /, no .)

Compliance flag for Alex (do NOT block the PR on this — separate
followup): the disclaimer wording above is a placeholder. The legal
status of a digital copy as expense-report evidence varies by
jurisdiction. In Sweden, SKV accepts digital receipts under
specific conditions. Worth a 30-min check with a Swedish accountant
before public launch.

Acceptance:
- Open any receipt on /app → click Download → PDF opens, looks like
  a receipt, in brand-book colors and typography.
- File can be uploaded to any standard expense-report tool
  (Expensify, Pleo, etc.) as the supporting attachment.
- 401 + 404 paths verified.
- PR title: `feat(step 8/9): digital-receipt PDF download (@react-pdf/renderer)`
```

---

## Step 9 — Polish + low-confidence review UX

```
Implement step 9 of the plan (Part 2 §D2 + parser confidence
handling). Steps 6-8 should be merged.

Goal: receipts with low parser confidence are surfaced as a
"Review needed" slice on /app, so users see them and complete
the missing fields before the receipt is "trustworthy" enough to
download as a PDF.

Implementation:

1. Add status enum to digital_receipts:
     status: 'verified' | 'pending_review'
   pending_review = parse_confidence < 0.75 OR a required field
   (merchant, purchased_at, total) is null.
   Migration + RLS update (no new RLS rules needed — same
   user-scoped policy).

2. /app list UI:
   - Add a "Review needed" filter chip at the top of the list.
   - Pending rows render with a yellow-tinted left border and a
     "needs review" badge (Figtree italic, brand Green Mint
     desaturated — find a brand-friendly attention color, not red).
   - When the user opens a pending row and saves with all required
     fields filled, automatically flip status to 'verified'.

3. Block PDF download on pending_review:
   - /api/receipts/[id]/pdf returns 409 Conflict if status is
     pending_review, with a JSON body
     `{ error: 'review_required', missing_fields: [...] }`.
   - Detail UI hides the Download button when pending and replaces
     with "Complete this receipt to download" inline hint.

4. Empty-state copy update on /app:
   - First-time inbox shows the forwarding email + SMS number
     with brand-book Figtree-italic callouts.
   - "Paper is Past" tagline somewhere subtle (footer or hero).

5. Tests:
   - vitest: confidence < 0.75 → status='pending_review'.
   - vitest: 409 from PDF endpoint when pending.
   - vitest: saving a pending row with all required fields flips
     status to 'verified'.

6. Light a11y pass on the new badge + filter chip (keyboard-
   reachable, aria-current on active filter, contrast on the
   pending-yellow against White Mist verified by axe).

Acceptance:
- Stub a low-confidence parse → row lands as pending_review with
  badge visible.
- Try Download on a pending row → blocked with copy.
- Complete the row → badge disappears, Download works.
- PR title: `feat(step 9/9): low-confidence review slice + PDF gating`
```

---

## After step 9

The plan is shipped end-to-end. Followups not in this batch:

- Connector to expense-report managers (Pleo, Expensify, Spendesk)
  — explicitly out-of-scope for this round per Alex's brief.
- Swedish-accountant review of the PDF disclaimer wording.
- Bulk-export (zip of PDFs for an entire month).
- Two-factor on the alias generation so a leaked alias can't flood
  someone's inbox with spam-as-receipts.
