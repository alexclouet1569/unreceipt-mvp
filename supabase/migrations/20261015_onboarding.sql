-- =============================================================================
-- 2026-10-15 — first-run onboarding (launch plan action 47)
--
-- profiles.onboarded_at: set once the customer finishes or skips the three
-- first-run screens on /app (forwarding address → first receipt → done), so
-- they show once per account rather than once per device. Written only by
-- POST /api/profile/onboarded with the service role; the existing column
-- grant (full_name, company_name) is unchanged. Idempotent.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
