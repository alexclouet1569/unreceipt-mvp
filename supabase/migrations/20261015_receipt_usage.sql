-- =============================================================================
-- 2026-10-15 — receipt usage ledger + plan on subscriptions (plan allowances)
--
-- Plans include a monthly number of receipts (src/lib/plans.ts); receipts
-- above it are billed per receipt. receipt_usage is an append-only ledger:
-- one row per receipt ever created, written by the server when the receipt
-- is saved. It has no foreign key to receipts on purpose — deleting a
-- receipt must not give the allowance back (otherwise: upload, export,
-- delete, repeat). Users can read their own rows; only the service role
-- writes. subscriptions gains the plan and the period start so usage is
-- counted over the same period Stripe bills.
-- Idempotent — safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.receipt_usage (
  receipt_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set once the receipt has been reported to Stripe as an extra receipt.
  overage_billed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS receipt_usage_user_created_idx
  ON public.receipt_usage(user_id, created_at);

ALTER TABLE public.receipt_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own receipt usage" ON public.receipt_usage;
CREATE POLICY "Users can view own receipt usage"
  ON public.receipt_usage FOR SELECT USING ((select auth.uid()) = user_id);

-- Count existing receipts so this month's usage is right from day one.
INSERT INTO public.receipt_usage (receipt_id, user_id, source, created_at)
SELECT r.id, r.user_id, COALESCE(r.source, 'unknown'), r.created_at
  FROM public.receipts r
 WHERE r.user_id IS NOT NULL
ON CONFLICT (receipt_id) DO NOTHING;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
