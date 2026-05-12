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

