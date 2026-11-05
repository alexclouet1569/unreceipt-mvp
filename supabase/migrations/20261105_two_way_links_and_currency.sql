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
