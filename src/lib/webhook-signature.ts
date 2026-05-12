// SERVER-ONLY. Svix-style webhook signature verification — the scheme Resend
// Inbound uses for `email.received` events.
//
// Signed string: `${svix-id}.${svix-timestamp}.${body}`
// Signature header `svix-signature` is a space-separated list of values
// shaped like `v1,<base64 HMAC-SHA256>`. We compute the expected value with
// the webhook secret (base64-decoded after stripping the `whsec_` prefix)
// and timing-safe-compare against each declared signature. Match on any →
// verified.
//
// The 5-minute timestamp skew window is enforced too — protects against
// replays of stale events from log dumps.

import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyInput = {
  body: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  // Override clock for tests. Falls back to Date.now().
  now?: () => number;
  // Tolerance window for the svix-timestamp header. 5 minutes matches
  // the Svix reference. Tests can shrink/widen as needed.
  toleranceSeconds?: number;
};

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "stale_timestamp" | "bad_signature" | "misconfigured" };

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

function decodeSecret(secret: string): Buffer | null {
  // Allow both `whsec_<base64>` (Svix canonical) and the bare base64.
  const stripped = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    const buf = Buffer.from(stripped, "base64");
    if (buf.length === 0) return null;
    return buf;
  } catch {
    return null;
  }
}

export function verifyWebhookSignature(input: VerifyInput): VerifyResult {
  const { body, id, timestamp, signature, secret } = input;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing_headers" };
  }

  const key = decodeSecret(secret);
  if (!key) {
    return { ok: false, reason: "misconfigured" };
  }

  // Skew check — reject if the timestamp claim is too far in the past or
  // future. The intent is to make stolen-bodies less useful for replay.
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const claimed = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(claimed)) {
    return { ok: false, reason: "missing_headers" };
  }
  const nowMs = (input.now ?? Date.now)();
  const skewSec = Math.abs(Math.floor(nowMs / 1000) - claimed);
  if (skewSec > tolerance) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  // Header carries a space-separated list of `vN,<base64sig>` entries.
  // We accept any v1 entry that matches our computed digest.
  for (const part of signature.split(" ")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx < 0) continue;
    const version = trimmed.slice(0, commaIdx);
    const value = trimmed.slice(commaIdx + 1);
    if (version !== "v1") continue;

    let candidate: Buffer;
    try {
      candidate = Buffer.from(value, "base64");
    } catch {
      continue;
    }
    if (candidate.length !== expected.length) continue;
    if (timingSafeEqual(candidate, expected)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "bad_signature" };
}

// Helper for tests: sign a body with the given secret in the Svix format.
export function signForTesting(
  body: string,
  id: string,
  timestamp: string,
  secret: string
): string {
  const key = decodeSecret(secret);
  if (!key) throw new Error("invalid secret");
  const sig = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return `v1,${sig}`;
}
