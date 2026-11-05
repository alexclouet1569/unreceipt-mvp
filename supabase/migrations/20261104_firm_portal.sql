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
