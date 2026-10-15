// SERVER-ONLY. Fixed-window rate limiting backed by Postgres
// (public.rate_limit_hit, see supabase/schema.sql 2026-10-14 block), so we
// don't add a vendor. Used to cap the routes that spend money — every OCR,
// re-run and inbound email is a paid Claude call — and the ones that write
// to storage.
//
// Fails OPEN: if the counter itself errors (function not yet applied, DB
// blip) the request goes through and we log. A rate limiter that takes
// capture down with it is worse than a few uncounted calls; the Anthropic
// console spend cap is the hard backstop.

import { getSupabaseAdmin } from "./supabase-admin";

export type RateLimitRule = {
  /** Max hits allowed inside one window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

// Per-user limits. Generous for a real person (a busy day is ~20 receipts;
// a photo-library scan may burst more) and low enough that a scripted loop
// can't run up a meaningful bill.
export const RATE_LIMITS = {
  ocr: [
    { limit: 60, windowSeconds: 60 * 60 },
    { limit: 300, windowSeconds: 24 * 60 * 60 },
  ],
  reprocess: [
    { limit: 20, windowSeconds: 60 * 60 },
    { limit: 100, windowSeconds: 24 * 60 * 60 },
  ],
  capture: [{ limit: 120, windowSeconds: 60 * 60 }],
  intakeEmail: [{ limit: 200, windowSeconds: 24 * 60 * 60 }],
  // Account deletion is heavy (Stripe, storage listing) and one real
  // person needs it once; a few retries after a failure is plenty.
  accountDelete: [{ limit: 5, windowSeconds: 60 * 60 }],
  // Each export renders a PDF per receipt and writes a ZIP to storage.
  export: [
    { limit: 10, windowSeconds: 60 * 60 },
    { limit: 30, windowSeconds: 24 * 60 * 60 },
  ],
  // Per IP: the form sends an email to whatever address is typed, so an
  // unthrottled loop would spam strangers from our domain.
  waitlist: [
    { limit: 5, windowSeconds: 60 * 60 },
    { limit: 20, windowSeconds: 24 * 60 * 60 },
  ],
} satisfies Record<string, RateLimitRule[]>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Counts one hit for `subject` (a user id, or an alias hash for inbound
 * email) against every rule of `name`. Returns ok:false as soon as any
 * window is over its limit.
 */
export async function rateLimit(
  name: RateLimitName,
  subject: string
): Promise<RateLimitResult> {
  const supabase = getSupabaseAdmin();

  for (const rule of RATE_LIMITS[name]) {
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_key: `${name}:${rule.windowSeconds}:${subject}`,
      p_window_seconds: rule.windowSeconds,
      p_limit: rule.limit,
    });

    if (error) {
      console.error("[rate-limit] counter failed, allowing request", {
        name,
        code: error.code,
      });
      return { ok: true };
    }

    if (data === false) {
      const now = Math.floor(Date.now() / 1000);
      const retryAfterSeconds =
        rule.windowSeconds - (now % rule.windowSeconds);
      return { ok: false, retryAfterSeconds };
    }
  }

  return { ok: true };
}

/**
 * Client IP for per-IP limits on unauthenticated routes. On Vercel the
 * platform overwrites x-forwarded-for, so its first entry is the real
 * client. Anything unidentifiable shares one "unknown" bucket.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Standard 429 body + Retry-After header for a failed rateLimit(). */
export function rateLimitedResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}
