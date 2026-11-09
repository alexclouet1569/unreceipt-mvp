-- =============================================================================
-- UnReceipt App Database Schema
-- Run this in Supabase SQL Editor to set up all tables
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends Supabase Auth users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company TEXT,
  role TEXT DEFAULT 'employee', -- 'employee' | 'finance' | 'admin'
  department TEXT,
  avatar_initials TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transactions (detected from bank / manually entered)
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_address TEXT,
  merchant_category TEXT DEFAULT 'other',
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  date DATE NOT NULL,
  time TIME,
  payment_method TEXT, -- 'Visa •••• 4821', 'Mastercard •••• 1234'
  status TEXT DEFAULT 'receipt_needed', -- receipt_needed | complete | approved | flagged
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Receipts (the core product — digital receipt data)
CREATE TABLE receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Merchant info (extracted from receipt)
  merchant_name TEXT,
  merchant_address TEXT,
  merchant_phone TEXT,
  merchant_vat_number TEXT,
  merchant_siret TEXT, -- French business ID

  -- Receipt details
  receipt_number TEXT,
  receipt_date DATE,
  receipt_time TIME,

  -- Totals
  subtotal DECIMAL(10,2),
  tax_amount DECIMAL(10,2),
  tax_rate DECIMAL(5,2), -- e.g. 20.00 for 20% VAT
  tip_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),

  -- Payment
  payment_method TEXT,
  card_last_four TEXT,
  transaction_ref TEXT,

  -- Source image
  image_url TEXT, -- stored in Supabase Storage
  image_captured_at TIMESTAMPTZ,

  -- UnReceipt metadata
  verification_code TEXT UNIQUE, -- unique code for this digital receipt
  capture_time_seconds INTEGER, -- how fast from payment to capture
  ocr_confidence DECIMAL(5,2), -- 0-100 OCR confidence score
  is_verified BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Receipt line items (every item on the receipt)
CREATE TABLE receipt_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID REFERENCES receipts(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(10,3) DEFAULT 1,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2), -- item-level VAT if applicable
  sort_order INTEGER DEFAULT 0
);

-- Row Level Security (RLS) — users can only see their own data
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;

-- Policies: users see their own data
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own receipts"
  ON receipts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own receipts"
  ON receipts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own receipts"
  ON receipts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own receipt items"
  ON receipt_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM receipts WHERE receipts.id = receipt_items.receipt_id AND receipts.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own receipt items"
  ON receipt_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM receipts WHERE receipts.id = receipt_items.receipt_id AND receipts.user_id = auth.uid()
  ));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_initials)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    UPPER(LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), 1) ||
           LEFT(REVERSE(split_part(COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), ' ', 2)), 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket for receipt images
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: users can upload to their own folder
CREATE POLICY "Users can upload receipt images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own receipt images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- WOZ Concierge Beta — schema additions (idempotent, safe to re-run)
-- All changes below use IF NOT EXISTS / DROP-then-CREATE so re-running this
-- block in the Supabase SQL Editor does not error on a populated database.
-- =============================================================================

-- updated_at helper (used by subscriptions, available for future tables)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- receipts.source — distinguishes self-service capture vs forwarded email vs
-- direct upload. Default 'captured' so existing rows backfill cleanly.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'captured';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receipts_source_check'
      AND conrelid = 'public.receipts'::regclass
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_source_check
      CHECK (source IN ('captured', 'forwarded', 'uploaded'));
  END IF;
END $$;

-- subscriptions — Stripe subscription lifecycle, keyed by user_id
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_status_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_status_check
      CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON public.subscriptions(user_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies on purpose. Only the service-role key
-- writes here — from the /api/webhooks/stripe handler. Customers should
-- never write to their own subscription row.

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- waitlist — already exists in production, codified here so the schema file
-- matches reality. Columns reverse-engineered from src/app/api/waitlist/route.ts.
-- Intentionally NO RLS: the route uses the anon key from getSupabase() and
-- inserts directly. If abuse becomes a concern, switch the route to a
-- service-role client and add an INSERT-only policy.
CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'landing_page',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- WOZ Concierge — admin paste-form fields on receipts
-- =============================================================================

-- The admin/concierge flow inserts a receipt for a customer who forwarded an
-- email — there's no bank transaction, so transaction_id has to be optional.
-- All previous self-service rows already have a transaction_id, so dropping
-- NOT NULL is non-destructive.
ALTER TABLE public.receipts
  ALTER COLUMN transaction_id DROP NOT NULL;

-- Categorization, currency, and a free-text notes field — none of which
-- existed in the pre-WOZ schema. Defaults are picked so existing rows
-- backfill safely.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receipts_category_check'
      AND conrelid = 'public.receipts'::regclass
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_category_check
      CHECK (category IN (
        'meals', 'transport', 'accommodation', 'office_supplies',
        'software', 'client_entertainment', 'travel', 'other'
      ));
  END IF;
END $$;

-- Index used by the admin dashboard's "most recent receipts per customer"
-- queries. Sort key is created_at (insertion time) so a freshly pasted
-- back-dated receipt still rises to the top of the founder's list.
CREATE INDEX IF NOT EXISTS receipts_user_id_created_at_idx
  ON public.receipts(user_id, created_at DESC);

-- =============================================================================
-- Customer-side receipt management — DELETE policies for both the row and
-- the storage object. The original schema only granted SELECT/INSERT/UPDATE
-- to authenticated users, so the customer dashboard couldn't delete its
-- own receipts via the anon client. Add idempotently.
-- =============================================================================

DROP POLICY IF EXISTS "Users can delete own receipts" ON public.receipts;
CREATE POLICY "Users can delete own receipts"
  ON public.receipts FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own receipt images" ON storage.objects;
CREATE POLICY "Users can delete own receipt images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- 2026-05-08 — public.profiles
--
-- Step 11.5 / email+password auth: when users sign up via email/password
-- we collect full name + company name. auth.users.raw_user_meta_data is
-- awkward to query/join, so mirror the editable bits into a thin
-- public.profiles table, keyed 1:1 on auth.users(id).
--
-- Rows are upserted by /auth/callback after exchangeCodeForSession via
-- the user's own session (RLS-allowed for SELECT/UPDATE on own row) and
-- INSERT happens via the service-role client during the callback handler
-- (so we don't need a client-side INSERT policy).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- A database bootstrapped from the top of this file already has
-- profiles(id, ...), so the CREATE above is skipped and the policies below
-- would fail on the missing user_id. Make sure both columns exist either way.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS company_name TEXT;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Reuse the shared updated_at trigger (defined once at top of this file).
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 2026-05-12 — digital-receipt canonicalization (plan step 3)
--
-- Every receipt the user submits — email forward, SMS forward, paper photo,
-- or manual entry — becomes one canonical row in public.receipts. The
-- existing schema is extended in place (per AGENTS.md conventions) so no
-- data migration on the UI side is required. New columns:
--
--   * `source`               — aligned to the canonical enum the intake
--                              handlers (steps 5–7) will produce. Existing
--                              values are migrated below.
--   * `purchased_at`         — when the purchase happened (timestamptz).
--                              Replaces the receipt_date/receipt_time split
--                              for sorting / intake. Old columns kept for
--                              backward compat; new code prefers this.
--   * `original_source_url`  — pointer to the raw artifact in storage
--                              (.eml, .txt, .pdf, image).
--   * `original_source_kind` — MIME-ish discriminator on that artifact.
--   * `intake_ref`           — idempotency key. Email Message-Id, Twilio
--                              MessageSid, or sha256 of a paper upload.
--                              Re-forwarded emails do not double-create.
--   * `parse_confidence`     — 0..1 — parser self-report × schema-validation
--                              pass-rate. Distinct from `ocr_confidence`
--                              which only covers the OCR step (does not
--                              apply to email/SMS intake).
--
-- Storage: a new `receipt-originals` bucket holds the raw artifacts. The
-- existing `receipts` bucket still holds the user-facing display image.
-- =============================================================================

-- 1. Migrate `source` enum from the WOZ values to the canonical four.
--    captured → paper   (in-app photo capture + OCR)
--    forwarded → manual (admin paste form — manual entry triggered by an
--                        email forward; when step 6 ships the auto-email
--                        intake, *new* rows will use source='email')
--    uploaded → paper   (legacy alias; no rows in practice)
--    Existing default 'captured' becomes 'manual' so a no-source insert
--    from the admin paste form lands correctly even if the call site
--    forgets to set it.
ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_source_check;

UPDATE public.receipts SET source = 'paper'  WHERE source = 'captured';
UPDATE public.receipts SET source = 'manual' WHERE source = 'forwarded';
UPDATE public.receipts SET source = 'paper'  WHERE source = 'uploaded';

ALTER TABLE public.receipts
  ALTER COLUMN source SET DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receipts_source_check'
      AND conrelid = 'public.receipts'::regclass
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_source_check
      CHECK (source IN ('email', 'sms', 'paper', 'manual'));
  END IF;
END $$;

-- 2. purchased_at — timestamptz of the actual purchase. Nullable on
--    existing rows; new code falls back to receipt_date when null.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ;

-- 3. Raw-artifact pointer + MIME-ish kind.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS original_source_url TEXT;
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS original_source_kind TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receipts_original_source_kind_check'
      AND conrelid = 'public.receipts'::regclass
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_original_source_kind_check
      CHECK (original_source_kind IS NULL OR original_source_kind IN (
        'eml', 'txt', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
      ));
  END IF;
END $$;

-- 4. Idempotency key. Unique only when present so manual entries (NULL)
--    don't collide. Email Message-Id, Twilio MessageSid, or sha256 of
--    a paper upload all flow into this column.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS intake_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS receipts_intake_ref_unique
  ON public.receipts(intake_ref)
  WHERE intake_ref IS NOT NULL;

-- 5. Parser confidence on the 0..1 scale.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS parse_confidence NUMERIC(3,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receipts_parse_confidence_check'
      AND conrelid = 'public.receipts'::regclass
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_parse_confidence_check
      CHECK (parse_confidence IS NULL OR (parse_confidence >= 0 AND parse_confidence <= 1));
  END IF;
END $$;

-- 6. Inbox-sort index. Customer dashboard sorts by purchased_at desc
--    when present, falling back to created_at — matches the COALESCE
--    expression used by the list query in step 4.
CREATE INDEX IF NOT EXISTS receipts_user_id_purchased_at_idx
  ON public.receipts(user_id, COALESCE(purchased_at, created_at) DESC);

-- 7. Storage bucket for raw intake artifacts.
--    Writes are server-only (intake handlers run with the service-role
--    key, bypassing RLS), so only a SELECT policy for the owner exists.
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipt-originals', 'receipt-originals', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can view own receipt originals" ON storage.objects;
CREATE POLICY "Users can view own receipt originals"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipt-originals'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- 2026-05-12 — email forwarding alias (plan step 6 / Part 2 §B1)
--
-- Each user gets a unique forwarding address `receipts+<hash>@in.unreceipt.com`.
-- The hash is the routing key for the Resend Inbound webhook at
-- /api/intake/email — the handler extracts the +tag from the To: address and
-- looks the user up by `email_alias_hash`. Per-user aliases avoid maintaining
-- a from-address whitelist (see plan Q1) and let us rotate a single user's
-- intake address without touching anyone else.
--
-- Properties of the column:
--   * 10-char Crockford base32 — case-insensitive, no I/L/O/U ambiguity.
--     ~50 bits of entropy is far more than enough for the address space we'll
--     ever care about, and short enough that the alias is still type-able.
--   * Nullable to let the app backfill lazily on the first profile read for
--     accounts that pre-date this column (no one-off data migration script).
--     The unique index ignores NULLs.
--   * Unique partial index — once minted, the alias is the routing key, so
--     a collision would silently mis-route a receipt to the wrong account.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_alias_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_alias_hash_unique
  ON public.profiles(email_alias_hash)
  WHERE email_alias_hash IS NOT NULL;

-- =============================================================================
-- 2026-05-12 — receipts.status: 'verified' | 'pending_review' (plan step 9)
--
-- A receipt is `pending_review` when the parser's confidence is below the
-- trustworthy threshold (0.75) OR when any required canonical field
-- (merchant_name, purchased_at, total) is null. The customer dashboard
-- surfaces these in a "Review needed" slice so the user fills the gaps
-- before the receipt is downloadable as a PDF.
--
-- New rows compute this in the intake handlers (src/lib/receipts/status.ts);
-- the column has a server-side default of 'verified' so a hand-written
-- INSERT without the column lands cleanly for self-service captures with
-- complete fields. The customer-side UPDATE policy already covers the
-- transition from pending_review → verified — no new RLS rules needed.
-- =============================================================================

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'verified';

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

-- One-time backfill — older rows pre-date the column. Flip to
-- pending_review only when the same rule the helper applies would fire
-- (low parser confidence OR a missing required field).
UPDATE public.receipts
   SET status = 'pending_review'
 WHERE status = 'verified'
   AND (
        merchant_name IS NULL
     OR total IS NULL
     OR COALESCE(purchased_at::text, receipt_date::text) IS NULL
     OR (parse_confidence IS NOT NULL AND parse_confidence < 0.75)
   );

-- List-filter index — the "Review needed" chip on /app reads
-- (user_id, status) on every paint.
CREATE INDEX IF NOT EXISTS receipts_user_id_status_idx
  ON public.receipts(user_id, status);


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

-- =============================================================================
-- 2026-10-14 — rate limits (launch plan actions 17–19)
--
-- Fixed-window counters for the routes that spend money (Claude OCR, re-run,
-- inbound email) or write to storage. Read and written only by the server
-- through rate_limit_hit() with the service-role key: RLS on, no policies,
-- function not callable by anon/authenticated. See src/lib/rate-limit.ts.
-- Idempotent — safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Counts one hit and returns TRUE while the window is still within p_limit.
-- Windows are aligned to the epoch so the app can compute Retry-After.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key TEXT,
  p_window_seconds INTEGER,
  p_limit INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_window TIMESTAMPTZ := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  v_count INTEGER;
BEGIN
  INSERT INTO public.rate_limits AS r (key, window_start, count)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = r.count + 1
  RETURNING r.count INTO v_count;

  -- Opportunistic cleanup (~1% of calls) instead of a cron job.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits
     WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER)
  TO service_role;

-- =============================================================================
-- 2026-10-14 — intake dedupe per user (launch plan action 21)
--
-- intake_ref (Message-Id) is sender-controlled, so a globally unique key let
-- one user's row block another user's copy of the same email — and a user
-- could set intake_ref on their own row to pre-empt someone else's mail.
-- Uniqueness is now per user. Create the new index before dropping the old
-- one so there is no window without a dedupe guarantee. Idempotent.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS receipts_user_intake_ref_unique
  ON public.receipts(user_id, intake_ref)
  WHERE intake_ref IS NOT NULL;

DROP INDEX IF EXISTS public.receipts_intake_ref_unique;

-- =============================================================================
-- 2026-10-14 — waitlist RLS (launch plan action 24)
--
-- The 2026-04 block created public.waitlist without RLS, so a database built
-- from this file exposed waitlist emails to the anon key. Production already
-- has RLS on (security advisor, 2026-10-14). No policies: only /api/waitlist
-- writes, through the service-role client. Idempotent.
-- =============================================================================

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

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

-- Server-only writes (RLS already denies them; this removes the grants too).
REVOKE INSERT, UPDATE, DELETE ON public.receipt_usage FROM anon, authenticated;

-- Count existing receipts so this month's usage is right from day one.
INSERT INTO public.receipt_usage (receipt_id, user_id, source, created_at)
SELECT r.id, r.user_id, COALESCE(r.source, 'unknown'), r.created_at
  FROM public.receipts r
 WHERE r.user_id IS NOT NULL
ON CONFLICT (receipt_id) DO NOTHING;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  -- True when the subscription carries the metered extra-receipt price;
  -- extra receipts are only reported to Stripe when it does.
  ADD COLUMN IF NOT EXISTS overage_enabled BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- 2026-10-15 — RLS policies evaluate auth.uid() once per query (performance)
--
-- Supabase's performance advisor (auth_rls_initplan, 11 policies): writing
-- `auth.uid() = user_id` re-evaluates auth.uid() for every row scanned;
-- `(select auth.uid()) = user_id` evaluates it once per query. Same rules,
-- same commands — only the expression changes. Idempotent.
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own receipts" ON public.receipts;
CREATE POLICY "Users can view own receipts"
  ON public.receipts FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own receipts" ON public.receipts;
CREATE POLICY "Users can insert own receipts"
  ON public.receipts FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own receipts" ON public.receipts;
CREATE POLICY "Users can update own receipts"
  ON public.receipts FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own receipts" ON public.receipts;
CREATE POLICY "Users can delete own receipts"
  ON public.receipts FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE USING ((select auth.uid()) = user_id);

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

-- =============================================================================
-- 2026-10-16 — Gmail forwarding confirmation codes (launch plan action 84)
--
-- Gmail starts auto-forwarding to the user's receipts+<hash>@ alias only
-- after someone types the code Gmail mails to that alias. /api/intake/email
-- recognises that email (src/lib/forwarding-confirmation.ts), keeps the
-- latest code here instead of filing it as a receipt, and the setup guide
-- (/app/settings/forwarding) shows it. One row per user: a newer email
-- replaces the older code. Only the code and the Gmail address are kept,
-- never the email or its link.
-- Server-only: written by intake and read by the guide page, both with the
-- service role. RLS on, no policies, grants revoked. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_forwarding_confirmations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail')),
  code TEXT CHECK (code ~ '^[0-9]{6,12}$'),
  for_address TEXT CHECK (char_length(for_address) <= 254),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_forwarding_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_forwarding_confirmations FROM anon, authenticated;

-- =============================================================================
-- 2026-10-16 — the user's own email addresses (receipt ownership check)
--
-- A DMARC pass proves an Uber/Stripe receipt really came from Uber/Stripe,
-- not that it was sent to this user: anyone holding a real receipt could
-- resend it unchanged to another user's forwarding alias. A full template
-- hit is therefore trusted only when the receipt's original To/Cc is one of
-- the user's own addresses: the account email, the forwarding alias, or an
-- address listed here (e.g. a work inbox that forwards to UnReceipt).
-- Self-declared on purpose: the list only affects the user's own receipts.
-- Written only by /api/profile/addresses (service role); users can read
-- their own rows. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_email_addresses (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL CHECK (char_length(address) BETWEEN 3 AND 254),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, address)
);

ALTER TABLE public.user_email_addresses ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.user_email_addresses FROM anon, authenticated;

DROP POLICY IF EXISTS "Users can view own email addresses" ON public.user_email_addresses;
CREATE POLICY "Users can view own email addresses"
  ON public.user_email_addresses FOR SELECT USING ((select auth.uid()) = user_id);

-- =============================================================================
-- 2026-11-04 — accounting-firm portal (launch plan phase 6: 99–101, firm side)
--
-- An accounting firm (redovisningsbyrå) signs in at /firm, sees the client
-- companies linked to it, completes receipts that need review and exports
-- each client's month for bookkeeping. Nothing here touches billing: each
-- client company keeps its own plan.
--
--   organizations      — the client company. Every user gets one default
--                        organisation (default_for_user_id), minted lazily in
--                        code like the forwarding alias and backfilled below;
--                        it cascades with the account so account deletion
--                        needs no extra step.
--   memberships        — user ↔ organisation (owner | member).
--   firms, firm_members — the firm and its staff. Staff are invited by email
--                        and claim the row on first confirmed sign-in with
--                        that address (user_id is NULL until then).
--   firm_clients       — firm ↔ organisation link: invited → active →
--                        revoked. organization_id is NULL until the client
--                        accepts (the invite may precede the client's account).
--   receipts.organization_id — which company a receipt belongs to; firm
--                        reads filter on it. Backfilled from the default
--                        organisation, and a BEFORE INSERT trigger fills it
--                        for any route that forgets.
--   receipts bookkeeping columns — seller org.nr, VAT per rate (vat_lines,
--                        JSON array of {rate, net, vat} like items), BAS
--                        account, and the exported / booked stamps so the
--                        same receipt is never booked twice. exported_by and
--                        booked_by carry no FK on purpose: the audit value
--                        must survive a staff account being deleted (same as
--                        edit_history[].by).
--
-- Authorization: receipts stay owner-only at the database (the 2026-10-14
-- REVOKE keeps its meaning). Firm access is server-side through
-- src/lib/require-firm.ts with the service role, scoped by organization_id.
-- Users can read their own memberships, organisations, firm membership and
-- firm links; every write is server-only. Idempotent — safe to re-run.
-- =============================================================================

-- Client companies -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  country TEXT NOT NULL DEFAULT 'SE' CHECK (country ~ '^[A-Z]{2}$'),
  org_number TEXT CHECK (org_number IS NULL OR char_length(org_number) <= 20),
  default_for_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.memberships (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS memberships_user_id_idx
  ON public.memberships(user_id);

-- Receipts belong to a company ----------------------------------------------
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS receipts_organization_purchased_idx
  ON public.receipts(organization_id, purchased_at DESC);

-- Backfill: one default organisation per existing user, an owner membership,
-- then every receipt. Safe to re-run (ON CONFLICT / IS NULL guards).
INSERT INTO public.organizations (name, default_for_user_id, created_by)
SELECT COALESCE(NULLIF(TRIM(p.company_name), ''), split_part(u.email, '@', 1), 'My company'),
       p.user_id,
       p.user_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
 WHERE p.user_id IS NOT NULL
ON CONFLICT (default_for_user_id) DO NOTHING;

INSERT INTO public.memberships (organization_id, user_id, role)
SELECT o.id, o.default_for_user_id, 'owner'
  FROM public.organizations o
 WHERE o.default_for_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.receipts r
   SET organization_id = o.id
  FROM public.organizations o
 WHERE r.organization_id IS NULL
   AND o.default_for_user_id = r.user_id;

-- Backstop: a receipt inserted without organization_id gets the owner's
-- default organisation, so it is never invisible to the firm.
CREATE OR REPLACE FUNCTION public.receipts_default_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT o.id INTO NEW.organization_id
      FROM public.organizations o
     WHERE o.default_for_user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.receipts_default_organization() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS receipts_set_organization ON public.receipts;
CREATE TRIGGER receipts_set_organization
  BEFORE INSERT ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.receipts_default_organization();

-- Accounting firms -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  org_number TEXT CHECK (org_number IS NULL OR char_length(org_number) <= 20),
  country TEXT NOT NULL DEFAULT 'SE' CHECK (country ~ '^[A-Z]{2}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS firms_set_updated_at ON public.firms;
CREATE TRIGGER firms_set_updated_at
  BEFORE UPDATE ON public.firms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.firm_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  -- NULL until the invited address signs in and claims the row.
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stored lowercased.
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS firm_members_firm_email_unique
  ON public.firm_members(firm_id, email);
-- One firm per person during the pilot; drop when that changes.
CREATE UNIQUE INDEX IF NOT EXISTS firm_members_user_unique
  ON public.firm_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS firm_members_email_idx
  ON public.firm_members(email) WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS public.firm_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  -- NULL until the client accepts.
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
  client_name TEXT NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 200),
  client_org_number TEXT CHECK (client_org_number IS NULL OR char_length(client_org_number) <= 20),
  -- Stored lowercased.
  invited_email TEXT NOT NULL CHECK (char_length(invited_email) BETWEEN 3 AND 254),
  -- sha256 of the link token; NULL once used or revoked.
  invite_token_hash TEXT,
  invite_expires_at TIMESTAMPTZ,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active firm per client company (pilot).
CREATE UNIQUE INDEX IF NOT EXISTS firm_clients_active_org_unique
  ON public.firm_clients(organization_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS firm_clients_invited_email_idx
  ON public.firm_clients(invited_email) WHERE status = 'invited';
CREATE INDEX IF NOT EXISTS firm_clients_firm_idx
  ON public.firm_clients(firm_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS firm_clients_token_unique
  ON public.firm_clients(invite_token_hash) WHERE invite_token_hash IS NOT NULL;

-- Bookkeeping facts and state on the receipt --------------------------------
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS seller_org_number TEXT,
  ADD COLUMN IF NOT EXISTS vat_lines JSONB,
  ADD COLUMN IF NOT EXISTS bas_account TEXT,
  ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exported_by UUID,
  ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booked_by UUID,
  ADD COLUMN IF NOT EXISTS booked_ref TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'receipts_vat_lines_is_array'
       AND conrelid = 'public.receipts'::regclass
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_vat_lines_is_array
      CHECK (vat_lines IS NULL OR jsonb_typeof(vat_lines) = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receipts_org_unexported_idx
  ON public.receipts(organization_id) WHERE exported_at IS NULL;

-- RLS: users read what is theirs; every write is server-only ---------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_clients ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.memberships FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.firms FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.firm_members FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.firm_clients FROM anon, authenticated;

DROP POLICY IF EXISTS "Users can view own memberships" ON public.memberships;
CREATE POLICY "Users can view own memberships"
  ON public.memberships FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Members can view own organizations" ON public.organizations;
CREATE POLICY "Members can view own organizations"
  ON public.organizations FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
       WHERE m.organization_id = organizations.id
         AND m.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view own firm membership" ON public.firm_members;
CREATE POLICY "Users can view own firm membership"
  ON public.firm_members FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Members can view own firm" ON public.firms;
CREATE POLICY "Members can view own firm"
  ON public.firms FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.firm_members fm
       WHERE fm.firm_id = firms.id
         AND fm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Parties can view firm links" ON public.firm_clients;
CREATE POLICY "Parties can view firm links"
  ON public.firm_clients FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.firm_members fm
       WHERE fm.firm_id = firm_clients.firm_id
         AND fm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.memberships m
       WHERE m.organization_id = firm_clients.organization_id
         AND m.user_id = (select auth.uid())
    )
  );

-- No firm policy on public.receipts: receipts stay owner-only at the
-- database and the firm reads them server-side (src/lib/require-firm.ts).

-- Pilot bootstrap, run by hand in the SQL editor (not part of this file):
--   INSERT INTO public.firms (name) VALUES ('<byrå>') RETURNING id;
--   INSERT INTO public.firm_members (firm_id, email, role)
--   VALUES ('<firm id>', '<staff@byra.se>', 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-11-05 — Two-way firm links + home currency
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. A client company can now invite its accountant (direction = 'client'),
--    not only the other way round (direction = 'firm', the default and
--    every existing row). For a client-sent invite the firm is unknown
--    until the accountant accepts, so firm_id becomes nullable and
--    organization_id is set from the start; invited_email is then the
--    accountant's address. Either way, accepting needs the invited,
--    confirmed address signed in (src/app/api/accountant/respond and
--    src/app/api/firm-request/respond).
--
-- 2. Every organisation has one home currency (default SEK). Receipts keep
--    their original amount and also get the amount in the home currency:
--    home_total, at fx_rate from the ECB reference rate of fx_date
--    (fx_source 'ecb'), the same amount when the currencies match
--    ('same'), or typed by the accountant from the bank statement
--    ('manual'). fx_rates caches the ECB daily rates (EUR base); only the
--    server reads or writes it.
--
-- Idempotent; safe to re-run.

-- 1. Two-way links ------------------------------------------------------------

ALTER TABLE public.firm_clients
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'firm';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firm_clients_direction_check') THEN
    ALTER TABLE public.firm_clients
      ADD CONSTRAINT firm_clients_direction_check CHECK (direction IN ('firm', 'client'));
  END IF;
END $$;

ALTER TABLE public.firm_clients ALTER COLUMN firm_id DROP NOT NULL;

-- A firm-sent invite always names its firm; a client-sent one always names
-- its organisation; an active link always has both.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firm_clients_parties_check') THEN
    ALTER TABLE public.firm_clients
      ADD CONSTRAINT firm_clients_parties_check CHECK (
        (direction = 'firm' AND firm_id IS NOT NULL)
        OR (direction = 'client' AND organization_id IS NOT NULL)
      ) NOT VALID;
    ALTER TABLE public.firm_clients VALIDATE CONSTRAINT firm_clients_parties_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firm_clients_active_parties_check') THEN
    ALTER TABLE public.firm_clients
      ADD CONSTRAINT firm_clients_active_parties_check CHECK (
        status <> 'active' OR (firm_id IS NOT NULL AND organization_id IS NOT NULL)
      ) NOT VALID;
    ALTER TABLE public.firm_clients VALIDATE CONSTRAINT firm_clients_active_parties_check;
  END IF;
END $$;

-- 2. Home currency --------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SEK';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_currency_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_currency_check CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

-- French organisations default to euros.
UPDATE public.organizations SET currency = 'EUR' WHERE country = 'FR' AND currency = 'SEK';

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS home_currency TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS home_total NUMERIC(12, 2);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(18, 8);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS fx_date DATE;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS fx_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_fx_source_check') THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_fx_source_check CHECK (fx_source IS NULL OR fx_source IN ('same', 'ecb', 'manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_home_currency_check') THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_home_currency_check CHECK (home_currency IS NULL OR home_currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

-- A change of amount, currency or date drops the conversion, whichever
-- server path writes it (edit, re-run, intake), so a stale home_total can
-- never reach the export. An update that sets home_total itself (a typed
-- bank amount, or the conversion) is left alone.
CREATE OR REPLACE FUNCTION public.receipts_clear_stale_fx()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (NEW.total IS DISTINCT FROM OLD.total
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.purchased_at IS DISTINCT FROM OLD.purchased_at
      OR NEW.receipt_date IS DISTINCT FROM OLD.receipt_date)
     AND NEW.home_total IS NOT DISTINCT FROM OLD.home_total
     AND NEW.fx_source IS NOT DISTINCT FROM OLD.fx_source THEN
    NEW.home_currency := NULL;
    NEW.home_total := NULL;
    NEW.fx_rate := NULL;
    NEW.fx_date := NULL;
    NEW.fx_source := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.receipts_clear_stale_fx() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS receipts_clear_stale_fx ON public.receipts;
CREATE TRIGGER receipts_clear_stale_fx
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.receipts_clear_stale_fx();

CREATE TABLE IF NOT EXISTS public.fx_rates (
  rate_date DATE NOT NULL,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  -- Units of `currency` per 1 EUR (ECB reference rate).
  per_eur NUMERIC(18, 8) NOT NULL CHECK (per_eur > 0),
  source TEXT NOT NULL DEFAULT 'ecb',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rate_date, currency)
);

-- Server-only cache: RLS on, no policies, no client grants.
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fx_rates FROM anon, authenticated;

-- =============================================================================
-- 2026-11-08 — Gmail forwarding confirmed for the user
--
-- When Gmail's "confirm this forwarding address" email names one of the
-- user's own inboxes, /api/intake/email confirms the request itself
-- (src/lib/forwarding-autoconfirm.ts) and records when here, so the setup
-- guide can skip "type the code". The code stays as a fallback. Written by
-- the service role only, like the rest of the table. The app works before
-- this block is applied (it retries the save without the column).
-- =============================================================================

ALTER TABLE public.email_forwarding_confirmations
  ADD COLUMN IF NOT EXISTS auto_confirmed_at TIMESTAMPTZ;

-- =============================================================================
-- 2026-11-08 — receipts.updated_at is maintained (security-reviewer finding)
--
-- This file never kept receipts.updated_at: no trigger here maintained it
-- and no writer sets it (PATCH /api/receipts/[id], /reprocess, the firm's
-- booking route, the export stamp, the FX save). Production did, through a
-- hand-made trigger `receipts_updated_at` that was never written down here
-- (found 2026-11-08 after this block was applied). This block makes the
-- file the record: one trigger, receipts_set_updated_at, on the file's
-- single update_updated_at() function, and the hand-made one is dropped
-- (it did the same thing, so nothing changes where it existed).
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
-- No backfill: in production the old trigger already kept the column;
-- elsewhere existing rows keep their insert time. Idempotent.
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

-- Dropped after the CREATE, so a partial run never leaves the table
-- without an updated_at trigger.
DROP TRIGGER IF EXISTS receipts_updated_at ON public.receipts;
