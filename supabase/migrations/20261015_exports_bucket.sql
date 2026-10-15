-- =============================================================================
-- 2026-10-15 — private bucket for accountant exports (launch plan action 45)
--
-- POST /api/export writes a ZIP (receipts.csv, PDFs, original files) to
-- `exports/<user_id>/…` with the service role and hands the browser a
-- 15-minute signed URL; Vercel can't return the ZIP directly (4.5 MB response
-- cap). Private, no storage policies: users never read or write it directly.
-- 50 MB per file is the Supabase Free plan's global maximum; exports are split
-- into parts of at most 40 MB. The daily cron deletes exports after 24 hours,
-- and account deletion removes the user's folder. Idempotent.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exports', 'exports', false, 52428800, ARRAY['application/zip'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
