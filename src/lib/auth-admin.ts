/**
 * Admin allowlist matcher.
 *
 * Reads CONCIERGE_ADMIN_EMAILS (comma-separated) and decides whether the
 * given email is on it. Pure function: no side effects, no imports of
 * server-only code. Safe to import from anywhere — but only useful on the
 * server, since the env var is not NEXT_PUBLIC_*.
 *
 * Fails closed: empty/unset/whitespace-only env returns false for every
 * input. Comparison is case-insensitive and tolerates surrounding
 * whitespace in the env value (typical paste error).
 */

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const raw = process.env.CONCIERGE_ADMIN_EMAILS;
  if (!raw || raw.trim() === "") return false;

  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) return false;

  return allowed.includes(email.trim().toLowerCase());
}

/** Where an admin without a second sign-in step is sent to set one up or use it. */
export const ADMIN_MFA_PATH = "/admin/mfa";

/**
 * True when the session's verified JWT claims say the user passed a second
 * sign-in step (Supabase MFA: `aal` is "aal2" after a TOTP code). Admins can
 * read every customer's data, so a stolen password or email code alone must
 * not be enough. Pure; pass claims from `auth.getClaims()`, never from an
 * unverified token.
 */
export function hasSecondFactor(claims: Record<string, unknown> | null | undefined): boolean {
  return claims?.aal === "aal2";
}
