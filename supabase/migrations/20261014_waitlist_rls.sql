-- =============================================================================
-- 2026-10-14 — waitlist RLS (launch plan action 24)
--
-- The 2026-04 block created public.waitlist without RLS, so a database built
-- from this file exposed waitlist emails to the anon key. Production already
-- has RLS on (security advisor, 2026-10-14). No policies: only /api/waitlist
-- writes, through the service-role client. Idempotent.
-- =============================================================================

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
