-- =============================================================================
-- 2026-10-14 — trust fields are server-only (launch plan action 29)
--
-- The owner RLS policies let a signed-in user write any column of their own
-- rows straight through the REST API with the anon key — including
-- receipts.status ('verified'), intake_ref, parse_confidence and totals of an
-- already-verified receipt, and profiles.email_alias_hash /
-- welcome_email_sent_at. For a product whose PDFs say "faithful digital copy",
-- a user must not be able to mint or rewrite a verified receipt.
--
-- Every receipt write now goes through server routes with the service role
-- (/api/capture, /api/intake/email, PATCH/DELETE /api/receipts/[id],
-- /reprocess), so users keep SELECT and DELETE only. Profiles keep a column
-- grant for the fields a settings page may edit. Direct uploads to the
-- receipts bucket are dropped too (/api/capture uploads server-side).
-- Idempotent.
-- =============================================================================

REVOKE INSERT, UPDATE ON public.receipts FROM anon, authenticated;

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, company_name) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can upload receipt images" ON storage.objects;
