// SERVER-ONLY. Verifies the OIDC token Google Cloud Pub/Sub puts on every
// push request (Authorization: Bearer <JWT>), so only our own push
// subscription can make /api/mailboxes/push/google read a mailbox.
//
// Checked: an RS256 signature by one of Google's published keys
// (googleapis.com/oauth2/v3/certs, fetched and cached by jose), the issuer
// (accounts.google.com, with or without https://), not expired, the
// audience the subscription was configured with (GOOGLE_PUBSUB_PUSH_AUDIENCE),
// and the email of the service account the subscription signs as
// (GOOGLE_PUBSUB_SA_EMAIL) with email_verified. Fails closed when either
// variable is unset.

import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

let remoteKeys: JWTVerifyGetKey | null = null;
function googleKeys(): JWTVerifyGetKey {
  // jose caches the key set and refetches on an unknown kid (rate-limited).
  remoteKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  return remoteKeys;
}

export type PushAuthResult =
  | { ok: true }
  /** 401: no or unreadable token, bad signature, expired. 403: valid token, wrong subscription. 503: not configured. */
  | { ok: false; status: 401 | 403 | 503; reason: string };

export function pushAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PUBSUB_PUSH_AUDIENCE && process.env.GOOGLE_PUBSUB_SA_EMAIL);
}

export async function verifyPubSubPush(
  authorization: string | null,
  { keys, currentDate }: { keys?: JWTVerifyGetKey; currentDate?: Date } = {},
): Promise<PushAuthResult> {
  const audience = process.env.GOOGLE_PUBSUB_PUSH_AUDIENCE;
  const serviceAccount = process.env.GOOGLE_PUBSUB_SA_EMAIL;
  if (!audience || !serviceAccount) return { ok: false, status: 503, reason: "not_configured" };

  const m = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization?.trim() ?? "");
  if (!m) return { ok: false, status: 401, reason: "missing_token" };

  let payload;
  try {
    ({ payload } = await jwtVerify(m[1], keys ?? googleKeys(), {
      issuer: ISSUERS,
      audience,
      algorithms: ["RS256"],
      clockTolerance: 30,
      currentDate,
    }));
  } catch (err) {
    // A valid signature for another audience is someone else's
    // subscription: 403. Everything else is an unauthenticated call.
    if (err instanceof errors.JWTClaimValidationFailed && err.claim === "aud") {
      return { ok: false, status: 403, reason: "wrong_audience" };
    }
    if (err instanceof errors.JWTExpired) return { ok: false, status: 401, reason: "expired" };
    return { ok: false, status: 401, reason: "invalid_token" };
  }

  if (typeof payload.email !== "string" || payload.email.toLowerCase() !== serviceAccount.toLowerCase()) {
    return { ok: false, status: 403, reason: "wrong_account" };
  }
  if (payload.email_verified !== true) return { ok: false, status: 403, reason: "unverified_account" };
  return { ok: true };
}
