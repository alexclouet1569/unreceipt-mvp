-- =============================================================================
-- 2026-11-08 — receipts.updated_at is maintained (security-reviewer finding)
--
-- receipts.updated_at was set once at insert (DEFAULT now()) and never moved:
-- no trigger kept it and no writer set it (PATCH /api/receipts/[id],
-- /reprocess, the firm's booking route, the export stamp, the FX save).
-- It now moves on every UPDATE, from any writer, through the file's single
-- update_updated_at() function.
--
-- Next to receipts_clear_stale_fx: Postgres runs BEFORE ROW triggers of the
-- same event in name order, so receipts_clear_stale_fx runs first, then
-- receipts_set_updated_at. Neither reads a column the other writes (the FX
-- trigger compares total, currency, dates, home_total and fx_source; this
-- one only sets updated_at), and neither runs an UPDATE of its own, so the
-- order doesn't matter and nothing recurses.
--
-- An UPDATE that matches a row moves updated_at even when no value changes
-- (e.g. un-booking an already un-booked receipt). Rows an UPDATE's filter
-- skips (e.g. the export stamp's `exported_at IS NULL`) are untouched.
-- Existing rows keep their insert time; there is no backfill. Idempotent.
--
-- The column is in the original CREATE TABLE, but production was partly
-- assembled by hand (2026-10-14 block) and nothing reads this column, so
-- its absence would have gone unnoticed. Without it the trigger would make
-- every UPDATE on receipts fail; ADD COLUMN IF NOT EXISTS does nothing
-- where it already exists.
-- =============================================================================

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DROP TRIGGER IF EXISTS receipts_set_updated_at ON public.receipts;
CREATE TRIGGER receipts_set_updated_at
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
