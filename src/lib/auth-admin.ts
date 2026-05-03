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
