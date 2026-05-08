-- 20260508 — public.profiles
--
-- Paste-able snapshot of the new schema block added to supabase/schema.sql
-- in the same PR. Apply via Supabase Dashboard → SQL Editor before
-- redeploying the email+password auth code; without it, the post-callback
-- profile upsert hits a missing relation and surfaces a 500.
--
-- schema.sql is still the canonical schema in this repo (per AGENTS.md);
-- this file exists so the founder has one block to copy/paste.
-- Idempotent — safe to run more than once.

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

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
