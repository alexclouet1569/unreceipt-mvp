# UnReceipt — Gap-fix prompts

Three prompts to close the holes found during the post-ship audit.
Paste one at a time into a Conductor workspace pointed at `unreceipt-mvp`.

Order matters:
1. **gap-2 (PDF route cleanup)** — do this first, it's a 5-min fix that
   guarantees PDF downloads stop being flaky.
2. **gap-1 (parser body)** — biggest UX impact. Email forwards become
   real digital receipts instead of empty placeholders.
3. **gap-3 (SMS intake)** — feature parity with email. Lower urgency
   if email + paper cover the dominant flows.

---

## gap-2 — Delete the stub PDF route, keep the real one

```
You are working in unreceipt-mvp on `main`.

Problem: there are two files at the same Next.js route path —
  src/app/api/receipts/[id]/pdf/route.ts    (plain-text fallback stub)
  src/app/api/receipts/[id]/pdf/route.tsx   (real @react-pdf/renderer)

Next.js cannot have both. Resolution is non-contractual across
build environments, so on some builds users will download a
plain-text response with a PDF mimetype instead of a real PDF.

What to do:
1. Confirm both files exist on origin/main:
     git ls-tree -r origin/main --name-only \
       | grep "pdf/route\\.\\(ts\\|tsx\\)"
2. Read both. The `.tsx` one imports `@react-pdf/renderer` and
   `ReceiptPdf` — that's the real implementation. The `.ts` one
   says "PDF rendering itself is a later concern (step 11+)" in
   its header — that's the stub.
3. Delete `src/app/api/receipts/[id]/pdf/route.ts`.
4. Re-run the tests in
   src/app/api/receipts/[id]/pdf/__tests__/route.test.ts and
   src/app/api/receipts/[id]/__tests__/pdf.test.ts. If either
   test references the `.ts` stub directly (e.g. importing from
   `./route.ts`), update them to import from `./route.tsx` or
   leave them as Next-routed integration tests against the live
   handler.
5. Run `next build`. Confirm there's no "duplicate route" warning
   in the build log.
6. Smoke-test manually: `pnpm dev`, log in, open a verified
   receipt, click Download. Confirm the file is a real PDF
   (open in Preview, see vector text, brand-book colors).

Acceptance:
- One file at that route path.
- `next build` clean.
- Download produces a real PDF, not text.
- PR title: `fix(pdf): remove stub route, keep real react-pdf handler`

Out of scope: changing the PDF design or layout.
```

---

## gap-1 — Write the real parser body

```
You are working in unreceipt-mvp on `main`.

Problem: src/lib/receipts/parser.ts ships as a stub that always
returns { status: 'pending_review' }. Its own comment says
"Step 5 will replace this body." That replacement never landed.

Today every forwarded email creates a pending_review row with
null merchant / null date / null total. The user must hand-fill
every field. That breaks the headline UX of "forward an email and
it becomes a digital receipt."

Goal: replace the parser body with a real dispatch that fills the
canonical fields on the dominant intake paths.

Reference (the original plan, §"Parser"):
  /Users/alexandreclouet/conductor/workspaces/gstack-ai-agent/
  warsaw/.context/plans/unreceipt-brand-and-digital-receipt.md

Implementation:

1. Three strategies dispatched by `kind`:

   a. `kind: 'email'`:
      - First try **template extractors** for known senders
        (DKIM-verified `from:` match against a small list).
        Start with these four — they're 80% of common forwards:
          * Uber receipts (uber.com / uber.us) — table-based HTML
          * Stripe receipts (stripe.com) — structured plain text
          * Amazon order confirmation (amazon.<tld>) — line items
          * Generic SaaS receipts (Resend, Vercel, OpenAI, etc.)
            — most have a $X.XX total and a "Receipt from <Brand>"
            subject pattern
        Put each template in src/lib/receipts/templates/<vendor>.ts
        with a `match(rawEmail) → boolean` and an
        `extract(rawEmail) → Partial<CanonicalReceiptFields>`.
      - If no template matches, fall through to LLM-extract.

   b. `kind: 'sms'`:
      - Regex-first for Swedish bank tx-confirmation patterns
        (the dominant SMB use case). Examples:
          Swedbank: "Köp <amount> SEK hos <MERCHANT> <date>"
          SEB:      "Kortköp <amount> kr <MERCHANT>"
          ICA Banken pattern, etc.
        Each pattern lives in
        src/lib/receipts/templates/sms-<bank>.ts.
      - Fall through to LLM-extract on the raw body.

   c. `kind: 'paper'`:
      - Input is OCR text from the existing /api/ocr route.
      - LLM-extract directly (no template — paper receipts vary
        too widely).

2. LLM-extract (shared by all three fallbacks):
   - Use the existing Claude wiring from src/lib/ocr.ts (or
     wherever the OCR LLM lives — find the pattern, don't
     duplicate the client).
   - Strict JSON output schema, Zod-validated. Schema mirrors
     CanonicalReceiptFields. Required: merchant_name,
     purchased_at, total. Optional: subtotal, tax_amount,
     tax_rate, category, payment_method, card_last_four, notes.
   - Prompt should instruct the model to return null for any
     field it can't extract with high confidence — never
     hallucinate.
   - Self-report confidence 0.0-1.0 as a separate field
     `parse_confidence` (don't put it in the canonical schema —
     it's a meta field).

3. Confidence + return value:
   - If all required fields are present AND parse_confidence >=
     0.75 → return { status: 'ok', fields }.
   - Otherwise → return { status: 'pending_review' }. Do NOT
     return partial fields — the intake handler currently
     inserts a row with nullable canonical fields when status is
     pending_review, which is the desired behavior. Save the
     LLM's partial output to digital_receipts.parser_draft
     (jsonb, new column — add a migration) so the user sees a
     pre-filled form when they open the review row, instead of
     starting from scratch.

4. Tests (vitest):
   - Fixture-based: drop real .eml / .txt / OCR samples into
     src/lib/receipts/__tests__/fixtures/{vendor}.eml etc., load
     them in tests, assert extraction.
   - At least 1 fixture per template (Uber, Stripe, Amazon,
     generic SaaS).
   - 1 fixture per SMS bank pattern.
   - 1 fixture for OCR'd paper receipt.
   - 1 fixture for an unparseable email — assert status is
     pending_review.
   - Mock the LLM client in unit tests; integration tests can
     hit real Claude with an env-gated `RUN_LLM_TESTS=1` flag.

5. Backfill (one-off script, NOT a migration):
   - Add `scripts/reparse-pending-rows.ts` that re-runs the new
     parser against all digital_receipts with status =
     'pending_review' AND source != 'manual'. For rows where the
     new parser returns 'ok', update the canonical fields and
     flip status to 'verified'. Document in the PR body how to
     run it manually after merge:
       `npx tsx scripts/reparse-pending-rows.ts`
     Don't run it in CI — it costs LLM calls.

Acceptance:
- Drop a real Uber email .eml fixture into the test suite,
  parser returns merchant='Uber', date, total correctly.
- Same for Stripe, Amazon, and one Swedish bank SMS.
- Forward a fresh real email to your alias in dev → row appears
  on /app with fields filled, status='verified', Download
  button enabled.
- Existing pending rows can be backfilled by the script.
- vitest clean.
- PR title: `feat(parser): real template + LLM extraction (replace step-5 stub)`

Out of scope: support for non-Swedish bank SMS patterns
(separate PR per bank), expense categorization (separate
feature).
```

---

## gap-3 — Land the SMS intake (step 7)

```
You are working in unreceipt-mvp. There is a local branch
`alexclouet1569/sms-intake-twilio` with WIP — pull it down,
finish it, push, open PR.

Reference (original step-7 prompt):
  /Users/alexandreclouet/conductor/workspaces/gstack-ai-agent/
  warsaw/.context/plans/unreceipt-handoff-prompts.md
  (the "Step 7 — SMS forwarding intake" section)

Goal: a forwarded SMS lands in /app as a new digital_receipts
row, mirroring the email intake architecture (#48).

Decisions locked from the original plan:
- Provider: Twilio.
- Address scheme: ONE shared Twilio number with sender phone
  match against profiles.phone (cheap, fits Swedish SMB market
  that won't pay for a personal forwarding number).
- intake_ref: Twilio MessageSid.
- MMS (photo) → fetch media → run through existing OCR path →
  parseReceipt({ kind: 'paper', raw: image }).
- SMS text-only → parseReceipt({ kind: 'sms', raw: body }).

Steps:

1. Pull / rebase the local branch:
     git fetch origin
     git checkout alexclouet1569/sms-intake-twilio
     git rebase origin/main
   Read what's already there. Note what's done, what's missing.

2. Migration: add profiles.phone (text, E.164-normalized,
   nullable) + profiles.phone_verified_at (timestamptz, nullable)
   if not present. Index profiles(phone) for the sender lookup.

3. Phone verification flow (settings page or signup add-on):
   - User enters phone → Twilio Verify sends a 6-digit code →
     user enters code → profiles.phone + phone_verified_at set.
   - Use Twilio Verify API, not roll-your-own.

4. Add webhook at src/app/api/intake/sms/route.ts:
   - Verify signature via twilio.validateRequest(authToken,
     headers['x-twilio-signature'], url, params).
   - 401 on signature failure.
   - Resolve user by From phone match (E.164). Unknown sender →
     200 with no row (don't leak which numbers are bound).
   - intake_ref = MessageSid → upsert.
   - NumMedia > 0: fetch each media URL with Twilio basic-auth
     (Account SID + Auth Token), store via the same
     receipt-originals upload helper from email intake. Run
     parseReceipt({ kind: 'paper', raw: { ocrText } }) on the
     OCR'd image. If multiple media, attach to the same row.
   - NumMedia == 0: parseReceipt({ kind: 'sms', raw: {
     from, body } }) on the text.
   - Same idempotent upsert + raw artifact retention as email.

5. Extract any shared intake helper into
   src/lib/receipts/intake.ts (if not already done in step 6).
   At minimum: alias-or-phone resolution, intake_ref upsert,
   raw artifact upload, parser dispatch + fallback. Email
   route should be refactored to use it in the same PR so we
   don't ship two near-duplicate handlers.

6. Tests (vitest + Playwright):
   - vitest: signature check rejects unsigned/forged requests.
   - vitest: idempotency by MessageSid.
   - vitest: unknown sender → 200, no row, no PII leak in
     response body.
   - vitest: text-only path calls parser with kind='sms'.
   - vitest: MMS path fetches media and calls parser with
     kind='paper'.
   - e2e: stub Twilio webhook with a real Swedish bank SMS
     fixture, assert /app shows the row with correct fields
     (depends on gap-1 parser landing for this to be
     meaningful).

7. Manual QA in PR body:
   - Verify a real phone in dev settings.
   - Forward a real bank SMS to the Twilio number → row
     appears.
   - Send an MMS receipt photo → row with OCR fields appears.

Env vars to document in README:
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_VERIFY_SERVICE_SID
  TWILIO_INBOUND_NUMBER (E.164)

Acceptance:
- e2e green for both text and MMS paths.
- next build clean.
- Refactored shared intake helper used by both email and SMS
  routes.
- PR title: `feat(step 7/9): SMS forwarding intake (Twilio, shared number)`

Out of scope: per-user Twilio numbers (premium tier later),
international bank-SMS patterns beyond Sweden.
```

---

## After all three land

The end-to-end flow finally works for real:

```
                    Forwarded email     SMS              Photo upload
                          │              │                    │
                          ▼              ▼                    ▼
                 ┌──────────────────────────────────────────────────┐
                 │   Real parser (templates + LLM, Zod-validated)   │
                 └──────────────────────────────────────────────────┘
                                          │
                                          ▼
                              digital_receipts (verified)
                                          │
                                          ▼
                                  /app inbox · Download
                                          │
                                          ▼
                                  Real PDF (react-pdf)
```

Followups still on the backlog after this batch:
- PR #42 (marketing brand cleanup) — merge or close.
- Swedish accountant review of PDF disclaimer wording.
- Bulk export (zip of PDFs for a month).
- Expense-report connector (Pleo/Expensify/Spendesk) — explicitly
  out of scope per Alex's original brief.
