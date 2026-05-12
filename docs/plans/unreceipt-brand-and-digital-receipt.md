# UnReceipt — Brand alignment + Digital Receipt canonicalization

**Author:** Alex (via /plan-eng-review session, 2026-05-12)
**Source brief:** "Match brand book typography + logo on the app. Any submitted receipt (email, SMS, paper) becomes a digital receipt in the app — full info copied in, saved like a normal receipt, downloadable for expense submission."
**Source of truth (brand):** `/Users/alexandreclouet/Documents/Startup /UnReceipt/UnReceipt Brand book Final.pdf`
**Implementation workspace:** `unreceipt-mvp/<one-of-the-named-workspaces>` (NOT `design-unreceipt`, which is marketing only)
**Out of scope (explicit):** integration with external expense-report managers — wire later.

---

## Part 1 — Brand alignment

### Locked brand tokens (from brand book pp. 12, 15, 16)

| Token | Value | Use |
|---|---|---|
| Green Mint | `#27BE7B` | Primary action, brand accents, "Receipt" half of wordmark |
| Deep Space | `#303568` | Headings, body text, "Un" half of wordmark |
| White Mist | `#ECF7E7` | Page background, tints |
| Carbon | `#191919` | Pure-mono variant only |
| Font (primary) | **Manrope** (ExtraBold, Bold, Medium, Regular, ExtraLight) | Wordmark, headings, body |
| Font (accent) | **Figtree Italic** (ExtraBold, SemiBold, Medium, Regular, Light — all italic) | Callouts, pull quotes, taglines |
| Tagline | "Paper is Past" | Hero, OG image |

### Logo (brand book pp. 9–11, 19)

- **Primary:** receipt-glyph (white receipt + Deep Space circular arrow) + wordmark "Un" (Deep Space) + "Receipt" (Green Mint), set in Manrope ExtraBold. Custom wordmark, not auto-rendered text.
- **Variants required:**
  1. Horizontal (primary) — header, footer, emails
  2. Vertical stacked — narrow placements
  3. Pure wordmark — when brand mark is already established on the page
  4. App icon / isotype — `192×192`, `512×512`, maskable + apple-touch
- **Color rules:**
  - On White Mist / white: navy "Un" + green "Receipt" + green receipt glyph (white inner)
  - On Deep Space bg: white "UnReceipt" + green-tinted receipt glyph
  - On Green Mint bg: navy "UnReceipt" + white receipt glyph
  - Mono fallback: Carbon on white, White Mist on Carbon
- **Don'ts (p. 17):** no gradient, no resizing receipt-vs-wordmark independently, no off-palette colors, no rotation, no shadow/glow effects, no typography swap.

### Checklist for the app codebase

A1. **Verify `src/app/globals.css`** has all four tokens as CSS vars (Mint, Deep Space, White Mist, Carbon). Marketing site already does — copy/match.
A2. **Verify `layout.tsx`** loads `Manrope` and `Figtree` from `next/font/google` with CSS-var bindings (`--font-sans`, `--font-accent`). Marketing site already does.
A3. **Add a `<Wordmark variant="horizontal|stacked|wordmark|icon">` React component** in `src/components/brand/Wordmark.tsx`. Single SVG source, render variants via props. Replaces any ad-hoc text "UnReceipt" in headers, sign-in, /app shell, magic-link emails.
A4. **PWA icon assets**: regenerate `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png` from the brand-book isotype. Update `public/manifest.json` `theme_color: "#27BE7B"`, `background_color: "#ECF7E7"`.
A5. **Email templates** (Resend / Supabase magic link): rebrand to use `#27BE7B` button + Manrope-substitute (Helvetica/Arial fallback in email, since web fonts in email are unreliable). Pull the existing welcome email and align it.
A6. **Audit for stray colors**: grep for any hex value that isn't one of the four locked tokens. Replace or justify each.

### Acceptance for Part 1

- Open `/app` and `/signin` — wordmark renders, no Tailwind default font flash, navy + green visible.
- Lighthouse PWA install banner shows the new isotype on iOS + Android.
- A `git grep` for old hex values returns zero hits outside `node_modules`.

---

## Part 2 — Digital Receipt canonicalization + download

### Mental model

Every receipt the user "submits" — regardless of source — becomes a **single canonical `digital_receipt` record** in the app, structurally identical no matter where it came from. The original artifact (email body, SMS text, paper photo) is stored alongside as evidence, but the canonical record is what the user sees, edits, exports, and (later) sends to expense-report tooling.

### Three intake paths → one canonical record

```
┌────────────────────────────┐
│ Path A: forwarding email   │──┐
│ receipts@unreceipt.io      │  │
│ (Amazon, Uber, SaaS, etc.) │  │
└────────────────────────────┘  │
                                │   ┌─────────────────────────────┐
┌────────────────────────────┐  │   │   PARSE & CANONICALIZE      │     ┌──────────────────────┐
│ Path B: SMS forward        │──┼──▶│  (server-side, idempotent)  │────▶│  digital_receipts    │
│ (number-bound number)      │  │   │   merchant • date • total   │     │  table (one row /    │
└────────────────────────────┘  │   │   currency • VAT • items    │     │   canonical receipt) │
                                │   │   payment method • notes    │     └──────────────────────┘
┌────────────────────────────┐  │   └─────────────────────────────┘                │
│ Path C: paper receipt      │──┘                                                  │
│ (photo upload, OCR)        │                                                     ▼
└────────────────────────────┘                                            ┌──────────────────────┐
                                                                          │  /app — same UI,     │
                                                                          │  same edit form,     │
                                                                          │  same download CTA   │
                                                                          └──────────────────────┘
```

### Data model

**Table: `digital_receipts`** (new, or align existing `receipts` schema to this)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk → auth.users | RLS: user can only read/write their own |
| `source` | enum `email`, `sms`, `paper`, `manual` | how it arrived |
| `merchant_name` | text | required |
| `purchased_at` | timestamptz | required — when the purchase happened (not when intaken) |
| `total_amount` | numeric(12,2) | required |
| `currency` | text (ISO-4217) | default `EUR` |
| `vat_amount` | numeric(12,2) | nullable |
| `vat_rate_pct` | numeric(5,2) | nullable |
| `payment_method` | text | "Visa •• 4242", "Cash", etc. |
| `category` | text | nullable, for expense reports |
| `notes` | text | user-editable free-form |
| `items` | jsonb | optional line items `[{label, qty, unit_amount, total}]` |
| `original_source_url` | text | pointer to raw artifact in storage (email .eml, sms text, paper image) |
| `original_source_kind` | enum `eml`, `txt`, `image/jpeg`, `image/png`, `application/pdf` | |
| `intake_ref` | text unique | idempotency key — Message-Id for email, SMS provider id, upload hash for paper |
| `parse_confidence` | numeric(3,2) | 0..1 — surfaces "review me" UX for low-confidence parses |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | |

**Indexes:** `(user_id, purchased_at desc)`, `unique(intake_ref)`.

**Storage:** raw artifacts in Supabase Storage bucket `receipt-originals/{user_id}/{receipt_id}.{ext}`, RLS-locked to owner.

### Intake handlers (server-side, idempotent)

**B1. Email forwarding (`POST /api/intake/email`)** — webhook from email provider (Resend Inbound, Postmark, or Cloudflare Email Workers).
- Verify provider signature.
- Look up `user_id` by `to:` alias (user gets a unique alias e.g. `alex+a1b2c3@in.unreceipt.com`, or maps the `from:` address against a verified-sender whitelist).
- `intake_ref = Message-Id` → upsert. Re-forwarded emails do not double-create.
- Persist raw `.eml` to storage.
- Run **parser** (see C below). Insert row with `source='email'`.

**B2. SMS forwarding (`POST /api/intake/sms`)** — Twilio webhook, signature-verified.
- Bind a Twilio number to each user (or a single number + sender match).
- `intake_ref = Twilio MessageSid`.
- Persist raw text. Parse. Insert row with `source='sms'`.

**B3. Paper / photo upload (`POST /api/intake/paper`)** — user-facing.
- Multipart upload (image or PDF), max 10 MB, MIME-check before storage.
- `intake_ref = sha256(file bytes)`.
- Persist file. Run **OCR** (existing `/api/ocr` route, or Google Vision / AWS Textract). Parse. Insert row with `source='paper'`.
- Low-confidence parses (`parse_confidence < 0.6`) land in a "Review needed" inbox slice — same table, different filter.

### Parser (`src/lib/receipts/parser.ts`)

Single function `parseReceipt({ kind, raw }): CanonicalReceiptFields`. Three strategies, dispatched by source:
- `email`: prefer structured (DKIM-verified sender + known template — Amazon, Uber, Lyft, Stripe receipts) → fall back to LLM-extract on cleaned plain-text body
- `sms`: regex-first (Swedish bank tx-confirmation patterns) → fall back to LLM-extract
- `paper`: OCR text → LLM-extract

LLM-extract uses a fixed JSON schema with Zod validation. Confidence = parser self-report × schema-validation pass-rate. No partial inserts — if required fields (merchant, purchased_at, total) can't be filled, intake row is created in a `pending_review` state with all fields nullable and the user manually completes.

### UI — `/app` (the receipts list + detail)

D1. **List view**: one row per `digital_receipts.id`, sorted by `purchased_at desc`. Each row shows source-icon (📧 / 💬 / 📷), merchant, total, date. No visual distinction between sources in the body — same card. Just the badge.
D2. **Detail / edit view**: every field editable (merchant, date, total, VAT, category, notes, items). "Save" updates the canonical record. Show "Original source" toggle that opens the stored `.eml` / `.txt` / image / PDF inline.
D3. **New-from-form path** (manual entry, `source='manual'`): same form, blank.
D4. **Download digital receipt** (CTA on detail view): generates a single-page PDF using the brand-book look. See section E.

### E. Digital Receipt PDF (download)

**Goal:** when the user clicks "Download," they get a PDF that *looks like a receipt, in our brand* — usable as the supporting document for any expense-report submission.

**Layout** (one page, A4 or US-Letter — pick A4 since core market is EU):

```
┌─────────────────────────────────────────────────┐
│  [UnReceipt wordmark — top-left]    Receipt #1234│
│                                                  │
│  Merchant:        ICA Supermarket Stockholm     │
│  Date:            12 May 2026, 14:32            │
│  Category:        Meals                          │
│                                                  │
│  ────────────────────────────────────────────   │
│  [optional line items table]                     │
│  ────────────────────────────────────────────   │
│                                                  │
│  Subtotal:                            155.20 kr │
│  VAT (25%):                            38.80 kr │
│  ────────────────────────────────────────────   │
│  TOTAL:                               194.00 kr │
│                                                  │
│  Payment:         Visa •• 4242                  │
│  Source:          Forwarded email · Message-Id  │
│                                                  │
│  Notes:                                         │
│  ─ user notes here ─                            │
│                                                  │
│  ────────────────────────────────────────────   │
│  Captured by UnReceipt · unreceipt.com          │
│  This is a faithful digital copy of an original │
│  receipt. Original artifact retained on file.   │
└─────────────────────────────────────────────────┘
```

- **Implementation:** server-side render via `@react-pdf/renderer` (works in Next.js route handlers, no headless browser needed). Endpoint: `GET /api/receipts/[id]/pdf`. Streams `application/pdf` with `Content-Disposition: attachment; filename="unreceipt-{merchant}-{date}.pdf"`.
- **Fonts:** Manrope + Figtree, bundled into the PDF via `Font.register` so the output is not OS-font-dependent.
- **Colors:** Deep Space text, Green Mint accents, White Mist tint blocks. Wordmark embedded as inline SVG → PDF vector.
- **Legal disclaimer line** at the bottom is intentional — protects the user when submitting to expense systems. Wording above is a placeholder; double-check with a Swedish accountant before going live, because the legal status of a "digital copy" varies by jurisdiction (in Sweden, SKV accepts digital receipts under specific conditions).
- **Auth:** PDF endpoint requires session, RLS-checked by `user_id`. Never serve another user's PDF on guessable URLs.

### Acceptance for Part 2

- Forward an email from a real Uber/Stripe/Amazon receipt to your forwarding address → within ~30s a new row appears in `/app` with merchant, date, total parsed correctly.
- Same for an SMS to the Twilio number.
- Upload a paper-photo → row appears with OCR-parsed fields; low-confidence rows are flagged.
- Click any row → detail view → edit any field → save → reload → fields persisted.
- Click "Download" → PDF downloads, looks like the brand, opens cleanly in Preview/Adobe.
- Forward the same email twice → only one row exists (idempotency).
- Sign in as a second user → cannot see the first user's PDF URL even if guessed (RLS).

---

## Order of work (suggested)

1. **Brand component** (`Wordmark.tsx`) + audit colors / fonts on app pages — 0.5 day. Unblocks every other PR's header.
2. **PWA icons + manifest** — 0.5 day.
3. **`digital_receipts` schema migration + RLS** — 0.5 day. Backfill existing `receipts` rows if any.
4. **Manual-entry form on canonical schema** — 0.5 day. Proves the round-trip.
5. **Paper upload + OCR + parser** — 1 day. (Build the parser module first — Path A and B reuse it.)
6. **Email forwarding intake** — 1 day. Requires DNS work done.
7. **SMS forwarding intake** — 0.5 day.
8. **PDF download endpoint** — 1 day.
9. **Polish, edge cases, low-confidence review UX** — 1 day.

≈6 focused days.

## Open questions for Alex

Q1. **Forwarding alias scheme:** one shared address (`receipts@unreceipt.io`) with whitelist on `from:`, or per-user unique alias (`alex+abc@in.unreceipt.com`)? Per-user is more reliable (no whitelist maintenance) but slightly more setup friction for the user.
Q2. **Paper OCR provider:** existing `/api/ocr` route (Gemini-based, per prior plan), Google Vision, or AWS Textract? Cost vs. accuracy tradeoff.
Q3. **Low-confidence threshold:** 0.6 is a guess. Better to start strict (0.8) and loosen than the other way round.
Q4. **PDF jurisdiction note:** is the disclaimer text worth a 30-min check with a Swedish accountant before launch? Yes — recommended.
