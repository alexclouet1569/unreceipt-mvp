-- =============================================================================
-- 2026-10-14 — receipts bucket limits (launch plan action 25)
--
-- The storage policies let a signed-in user upload straight to their folder in
-- the `receipts` bucket with the anon key, bypassing /api/capture's checks.
-- Enforce the same rules at the bucket: 4 MB, receipt image/PDF types only
-- (src/lib/receipts/upload-limits.ts). Idempotent.
-- =============================================================================

UPDATE storage.buckets
   SET file_size_limit = 4194304,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 WHERE id = 'receipts';
