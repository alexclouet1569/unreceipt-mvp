# Booking agent: from receipt to voucher in Fortnox (2026-11-20)

## Why

UnReceipt captured, read and organised receipts, then stopped: the firm exported `bookkeeping.csv` and typed each voucher into Fortnox by hand. The founder's direction (2026-11-20) is "service as software": an AI agent that does the expense work end to end, in the platform the company already uses, starting with Fortnox.

## Position (honest)

- **Not Wint or Bronn.** They sell "AI plus our accountants do your books" (Wint from 675 kr/month), which replaces the accounting firm. UnReceipt works *inside* the company's own Fortnox and *with* its existing accountant, the channel we sell through.
- **Proposes, a person approves.** The company stays responsible for its books (BFL). Auto-posting is a later product, only once data shows ≥ 85 % of proposals approved unchanged.
- **Bet, not validated demand.** No customer asked yet. Phase 0 gets a real Fortnox customer before more is built.
- **Other parts of the business wait** until ≥ 3 companies post through UnReceipt every week. The natural next one is supplier invoices (same Fortnox connection).

## Phase 0: founder actions (before the code can be used)

1. Ask Fortnox for a developer licence (launch plan action 9). In the Developer Portal create the integration with scopes `bookkeeping`, `inbox`, `connectfile`, `companyinformation`, `settings` and the redirect URI `https://app.unreceipt.com/api/accounting/fortnox/callback`. Get a test company.
2. Ask Fortnox: can a pilot customer connect an unpublished integration? What does the partner agreement require (security whitepaper, review time, "buy via Fortnox")? Does the customer's licence need anything?
3. Find 3 pilot companies on Fortnox, ideally through the pilot accounting firm. Ask that accountant for each company's voucher series, the account card payments come from (1930 or a card liability account), and the account employee outlays are paid back from (2890/2820).
4. Set `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET`, `INTEGRATION_TOKEN_KEY` in Vercel and apply the 2026-11-20 schema block.
5. Keep the website saying "no Fortnox integration" until a pilot company has posted through it in production.

## What was built (Phase 1)

See AGENTS.md → "Booking agent". In short: connect Fortnox (owner or the linked firm), set series and payment accounts, open a confirmed receipt → proposed voucher with reasons → **Approve and book in Fortnox** (single in the receipt sheet, or several at once on the firm's client page) → voucher number shown, receipt file attached, receipt marked booked. Never posts twice: a lost answer is reconciled by a marker in the voucher's description.

## Success metric (decides Phase 2)

On the pilot companies, from `booking_proposals`:

- share of proposals approved with `edited = false` (target ≥ 85 % on repeat merchants);
- median time from receipt to posted;
- share of receipts that needed a person (blocked).

## Phase 2 (only after the metric holds)

- Seed the memory from the company's own Fortnox voucher history (last 12 months).
- Opt-in auto-posting for repeat merchants above the threshold, with a daily summary.
- SIE4 export for Spiris and Bokio.
- Supplier invoices.
- The iPhone app.
