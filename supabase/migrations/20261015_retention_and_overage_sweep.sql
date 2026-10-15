-- =============================================================================
-- 2026-10-15 — retention job + extra-receipt retry sweep (launch plan 58, P5)
--
-- Retention (privacy page, "How long we keep it"): after a cancellation the
-- account stays 90 days, we email a reminder ~14 days before, then delete.
--   subscriptions.ended_at  — when Stripe ended the subscription (from the
--                             webhook); the 90 days count from here.
--   account_retention       — one row per user once the reminder email went
--                             out, tied to the ended_at it was about, so a
--                             customer who resubscribes and cancels again
--                             gets a fresh reminder. Deletion requires this
--                             row (never delete without the warning).
-- Server-only: RLS on, no policies, grants revoked. Users never read it.
--
-- Overage sweep: Stripe dedupes meter events on `identifier` for only "a
-- rolling period of at least 24 hours" (API reference, checked 2026-10-15),
-- so a daily retry of an event that actually reached Stripe a day earlier
-- could charge twice.
--   receipt_usage.overage_attempted_at — set right before each Stripe call;
--   the sweep retries automatically only inside the dedupe window and
--   reports older ambiguous rows to Sentry for a person to check.
-- Idempotent.
-- =============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

ALTER TABLE public.receipt_usage
  ADD COLUMN IF NOT EXISTS overage_attempted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.account_retention (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ended_at TIMESTAMPTZ NOT NULL,
  reminder_sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_retention ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_retention FROM anon, authenticated;
