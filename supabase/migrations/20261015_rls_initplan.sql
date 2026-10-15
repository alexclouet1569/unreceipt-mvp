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
