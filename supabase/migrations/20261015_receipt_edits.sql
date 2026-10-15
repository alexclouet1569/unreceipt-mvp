-- =============================================================================
-- 2026-10-15 — edits to receipts are recorded (launch plan actions 41–42)
--
-- Customers can now correct any receipt, verified ones included. The original
-- file is never touched; what changes is the extracted data. Every change to
-- a factual field (merchant, total, currency, date, VAT, payment method,
-- line items) is recorded so the detail view and the PDF can say
-- "Edited by you on <date>" and show what the value was before:
--   edited_at      — when the last such change was saved
--   edited_fields  — every field the customer has changed so far; re-running
--                    extraction never overwrites these
--   edit_history   — [{ at, changes: { field: { from, to } } }], newest last
-- Written only by PATCH /api/receipts/[id] with the service role (users have
-- no INSERT/UPDATE grant on receipts since 2026-10-14). Idempotent.
-- =============================================================================

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_fields TEXT[],
  ADD COLUMN IF NOT EXISTS edit_history JSONB;
