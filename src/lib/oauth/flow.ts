// SERVER-ONLY. The provider-independent pieces of an OAuth connect flow,
// shared by connected mailboxes (src/lib/mailboxes/oauth.ts) and accounting
// connections (src/lib/accounting/oauth.ts):
//
//   state          32 random bytes (base64url), the pending row's key.
//   PKCE           S256: verifier 32 random bytes, challenge its sha256.
//   binding cookie a separate random value set HttpOnly on the browser that
//                  starts the flow; the row keeps only its sha256. The
//                  callback must see the same cookie, so a `code`+`state`
//                  pair replayed in another browser is refused.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const b64url = (bytes: Buffer) => bytes.toString("base64url");
export const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export function newState(): string {
  return b64url(randomBytes(32));
}

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier, "ascii").digest());
  return { verifier, challenge };
}

export function newBindingValue(): string {
  return b64url(randomBytes(32));
}

/** A state as the callback may receive it; anything else is unknown. */
export function isWellFormedState(state: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(state);
}

/**
 * One cookie per flow, named after the state's hash, so two flows started
 * in two tabs don't overwrite each other.
 */
export function bindingCookieNameFor(prefix: string, state: string): string {
  return `${prefix}_${sha256Hex(state).slice(0, 16)}`;
}

/** HttpOnly cookie options, scoped to the callback path. */
export function bindingCookieOptionsFor(path: string, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Browsers treat localhost as secure; only `next dev` over plain http
    // on another host would need it off.
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax" as const,
    path,
    maxAge: maxAgeSeconds,
  };
}

/** Constant-time check of the cookie against the stored hash. */
export function bindingMatches(cookieValue: string | undefined, storedHash: string): boolean {
  if (!cookieValue || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const a = Buffer.from(sha256Hex(cookieValue), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
