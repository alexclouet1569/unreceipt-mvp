// Invite links from an accounting firm to a client company. The link
// carries a random token; only its sha256 is stored (firm_clients.
// invite_token_hash), so a database read never yields a usable link.

import { createHash, randomBytes } from "node:crypto";

export const INVITE_TTL_DAYS = 14;

export function mintInviteToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiry(now = new Date()): string {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** A token as it appears in a link: base64url, 32 chars for 24 bytes. */
export function isInviteTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function inviteAcceptPath(token: string): string {
  return `/app/accountant/accept?token=${encodeURIComponent(token)}`;
}

/** The accountant's side of a client-sent invite (2026-11-05). */
export function requestAcceptPath(token: string): string {
  return `/app/firm-request?token=${encodeURIComponent(token)}`;
}

export function isInviteExpired(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t < now.getTime();
}
