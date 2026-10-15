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
