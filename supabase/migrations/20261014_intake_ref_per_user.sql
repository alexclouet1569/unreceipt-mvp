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
