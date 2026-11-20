// Timing rules for the sign-in email code, shared by the sign-in, verify
// and delete-account screens. The website has the same rules in
// src/app/app/login/_auth-lib.ts.

/**
 * Supabase sends one code per address per minute (Auth → Rate Limits,
 * "minimum interval between emails"). Offering "Send a new code" sooner only
 * earns a "please wait" refusal.
 */
export const RESEND_AFTER_S = 60;

/**
 * When Supabase refuses a code because one went to this same address less
 * than a minute ago, the seconds until another may be sent; otherwise null.
 * That refusal means a valid code is already on its way, so the person
 * should go on to type it rather than be stopped on the email screen. The
 * project-wide hourly limit ("email rate limit exceeded") sent nothing and
 * returns null.
 */
export function recentCodeWait(error: { code?: string; message?: string } | null | undefined): number | null {
  if (!error) return null;
  const match = /only request this after (\d+) seconds?/i.exec(error.message ?? "");
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, RESEND_AFTER_S) : null;
}
