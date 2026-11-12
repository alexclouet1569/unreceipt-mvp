// Where to send someone after signing in: a same-origin path only, or
// "/app". Shared by /auth/callback (the email link) and /app/login (the
// password and code forms), so both accept exactly the same values.
// Pure: safe to import from client and server code.

const SAFE_NEXT_RE = /^\/[a-zA-Z0-9_\-/?=&%.]*$/;
export const DEFAULT_NEXT = "/app";

export function safeNext(raw: string | null | undefined): string {
  // Only paths starting with "/": no scheme, host, backslash, "@" or
  // anything a browser could read as another origin.
  if (!raw || raw.length > 1024) return DEFAULT_NEXT;
  if (!SAFE_NEXT_RE.test(raw)) return DEFAULT_NEXT;
  // "//evil.com" passes the regex but is a protocol-relative URL — the
  // browser resolves it to another host.
  if (raw.startsWith("//")) return DEFAULT_NEXT;
  return raw;
}
