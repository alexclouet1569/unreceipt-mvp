// SERVER-ONLY. The iPhone app's one-time "connect a mailbox" link.
//
// The app has a bearer token, but the OAuth flow runs in the system sign-in
// sheet (a browser without our session). POST /api/mailboxes/connect-link
// therefore hands the app a short-lived link that names the user:
// /api/mailboxes/connect/<provider>?link=<token>. The token is
// base64url(JSON payload) + "." + base64url(HMAC-SHA256), keyed with
// MAILBOX_STATE_SECRET, bound to the user id, the provider and a random
// jti, valid 5 minutes. The jti is stored on the pending OAuth row it
// starts (unique), so one link starts one flow.
//
// A link alone never connects anything: GET shows a confirmation page that
// names the UnReceipt account, and only its same-origin POST starts the
// flow (src/app/api/mailboxes/connect/[provider]/route.ts).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isMailboxProviderId, type MailboxProviderId } from "./types";

export const LINK_TTL_SECONDS = 5 * 60;
const PURPOSE = "unreceipt-mailbox-link.v1";
const MIN_SECRET_LENGTH = 32;

type LinkPayload = { v: 1; u: string; p: MailboxProviderId; j: string; e: number };

export type VerifiedLink = { ok: true; userId: string; provider: MailboxProviderId; jti: string; expiresAt: number };
export type LinkFailure = { ok: false; reason: "invalid" | "expired" | "wrong_provider" };

export class MailboxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailboxConfigError";
  }
}

function stateSecret(): string {
  const secret = process.env.MAILBOX_STATE_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new MailboxConfigError("MAILBOX_STATE_SECRET is missing or shorter than 32 characters");
  }
  return secret;
}

export function linkSecretConfigured(): boolean {
  try {
    stateSecret();
    return true;
  } catch {
    return false;
  }
}

function sign(body: string): Buffer {
  return createHmac("sha256", stateSecret()).update(`${PURPOSE}.${body}`).digest();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signConnectLink(
  { userId, provider }: { userId: string; provider: MailboxProviderId },
  now: number = Date.now(),
): { token: string; jti: string; expiresAt: number } {
  if (!UUID.test(userId)) throw new Error("invalid user id");
  const jti = randomBytes(16).toString("base64url");
  const expiresAt = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  const payload: LinkPayload = { v: 1, u: userId, p: provider, j: jti, e: expiresAt };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: `${body}.${sign(body).toString("base64url")}`, jti, expiresAt: expiresAt * 1000 };
}

export function verifyConnectLink(
  token: string | null | undefined,
  provider: MailboxProviderId,
  now: number = Date.now(),
): VerifiedLink | LinkFailure {
  if (typeof token !== "string" || token.length > 512) return { ok: false, reason: "invalid" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) {
    return { ok: false, reason: "invalid" };
  }
  const [body, mac] = parts;
  const expected = sign(body);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "invalid" };
  }
  let payload: Partial<LinkPayload>;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (
    payload?.v !== 1 ||
    typeof payload.u !== "string" ||
    !UUID.test(payload.u) ||
    !isMailboxProviderId(payload.p) ||
    typeof payload.j !== "string" ||
    payload.j.length < 16 ||
    typeof payload.e !== "number"
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (payload.e * 1000 <= now) return { ok: false, reason: "expired" };
  if (payload.p !== provider) return { ok: false, reason: "wrong_provider" };
  return { ok: true, userId: payload.u, provider: payload.p, jti: payload.j, expiresAt: payload.e * 1000 };
}
