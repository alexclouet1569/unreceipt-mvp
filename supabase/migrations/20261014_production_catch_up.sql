-- =============================================================================
-- 2026-10-14 — production catch-up
--
-- Production was assembled by hand from several generations of this file and
-- the 2026-05-12 blocks never reached it. Audit on 2026-10-14 found:
--   * receipts was missing columns the code writes (subtotal, card_last_four,
--     …) — the email-intake insert would have failed on every email;
--   * receipts.status was left over from the April prototype (nullable,
--     default 'captured', no check) instead of 'verified' | 'pending_review';
--   * profiles.email_alias_hash was missing — nobody had a forwarding address;
--   * handle_new_user() wrote profiles.id but never profiles.user_id, the
--     column every query uses — so no user had a usable profile row;
--   * security advisor: handle_new_user() callable over the REST API, and
--     both trigger functions had a mutable search_path.
-- Adds profiles.welcome_email_sent_at for the pilot welcome email.
-- Idempotent — safe to re-run.
-- =============================================================================

-- receipts: columns the app reads and writes -------------------------------
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS merchant_phone TEXT,
  ADD COLUMN IF NOT EXISTS merchant_vat_number TEXT,
  ADD COLUMN IF NOT EXISTS merchant_siret TEXT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS card_last_four TEXT,
  ADD COLUMN IF NOT EXISTS transaction_ref TEXT,
  ADD COLUMN IF NOT EXISTS verification_code TEXT,
  ADD COLUMN IF NOT EXISTS capture_time_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS items JSONB;

-- verification_code was UNIQUE in the original receipts table.
CREATE UNIQUE INDEX IF NOT EXISTS receipts_verification_code_unique
  ON public.receipts(verification_code)
  WHERE verification_code IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receipts_items_is_array'
      AND conrelid = 'public.receipts'::regclass
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_items_is_array
      CHECK (items IS NULL OR jsonb_typeof(items) = 'array');
  END IF;
END $$;

-- receipts.status → 'verified' | 'pending_review' (same rule as
-- src/lib/receipts/status.ts and the 2026-05-12 backfill) -------------------
UPDATE public.receipts
   SET status = CASE
         WHEN merchant_name IS NULL
           OR total IS NULL
           OR COALESCE(purchased_at::text, receipt_date::text) IS NULL
           OR (parse_confidence IS NOT NULL AND parse_confidence < 0.75)
         THEN 'pending_review'
         ELSE 'verified'
       END
 WHERE status IS NULL OR status NOT IN ('verified', 'pending_review');

ALTER TABLE public.receipts ALTER COLUMN status SET DEFAULT 'verified';
ALTER TABLE public.receipts ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receipts_status_check'
      AND conrelid = 'public.receipts'::regclass
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_status_check
      CHECK (status IN ('verified', 'pending_review'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receipts_user_id_status_idx
  ON public.receipts(user_id, status);

-- profiles: forwarding alias + welcome email --------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_alias_hash TEXT,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_alias_hash_unique
  ON public.profiles(email_alias_hash)
  WHERE email_alias_hash IS NOT NULL;

-- New users get a profile keyed on BOTH id and user_id (the app reads
-- user_id; id is the original primary key and still references auth.users).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, full_name, company_name)
  VALUES (
    NEW.id,
    NEW.id,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), '')
  )
  ON CONFLICT (id) DO UPDATE
    SET user_id = EXCLUDED.user_id
    WHERE public.profiles.user_id IS NULL;
  RETURN NEW;
END;
$$;

-- Trigger-only function: nobody should call it over /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- now() lives in pg_catalog, which is always searched.
ALTER FUNCTION public.update_updated_at() SET search_path = '';

-- Backfill: every existing user gets a usable profile row.
INSERT INTO public.profiles (id, user_id, full_name, company_name)
SELECT u.id,
       u.id,
       NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
       NULLIF(TRIM(u.raw_user_meta_data->>'company_name'), '')
  FROM auth.users u
 WHERE NOT EXISTS (
         SELECT 1 FROM public.profiles p
          WHERE p.id = u.id OR p.user_id = u.id
       );

UPDATE public.profiles SET user_id = id WHERE user_id IS NULL;

-- public.waitlist: RLS on with no policies is intentional — only
-- /api/waitlist writes to it, through the service-role client.
