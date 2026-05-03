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
