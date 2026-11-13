// SERVER-ONLY. Encrypts the refresh tokens of connected mailboxes
// (mailbox_connections.refresh_token_enc) with AES-256-GCM, so the database
// never holds a usable token. Never import from a "use client" file:
// MAILBOX_TOKEN_KEY is not NEXT_PUBLIC_*, so a stray client import finds no
// key and every call throws.
//
// Format: "v1.<iv>.<tag>.<ciphertext>", each part base64url. The version
// lets a later key or algorithm live next to v1 rows. A context string
// (the owner's user id) is bound as additional authenticated data: a token
// copied onto another user's row fails to decrypt. Any change to the
// ciphertext, tag, iv or context throws.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class MailboxCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailboxCryptoError";
  }
}

/** The 32-byte key from MAILBOX_TOKEN_KEY (base64). Throws when unusable. */
function tokenKey(): Buffer {
  const raw = process.env.MAILBOX_TOKEN_KEY?.trim();
  if (!raw) {
    throw new MailboxCryptoError("MAILBOX_TOKEN_KEY is not set (openssl rand -base64 32)");
  }
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) {
    throw new MailboxCryptoError("MAILBOX_TOKEN_KEY must be base64");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new MailboxCryptoError(`MAILBOX_TOKEN_KEY must decode to ${KEY_BYTES} bytes`);
  }
  return key;
}

/** True when MAILBOX_TOKEN_KEY is present and the right length. */
export function tokenKeyConfigured(): boolean {
  try {
    tokenKey();
    return true;
  } catch {
    return false;
  }
}

const aad = (context: string) => Buffer.from(`unreceipt-mailbox:${context}`, "utf8");

export function encryptToken(plaintext: string, context: string): string {
  if (!plaintext) throw new MailboxCryptoError("nothing to encrypt");
  if (!context) throw new MailboxCryptoError("missing context");
  const key = tokenKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

const B64URL = /^[A-Za-z0-9_-]+$/;

export function decryptToken(blob: string, context: string): string {
  if (!context) throw new MailboxCryptoError("missing context");
  const parts = typeof blob === "string" ? blob.split(".") : [];
  if (parts.length !== 4 || parts[0] !== VERSION || !parts.slice(1).every((p) => B64URL.test(p))) {
    throw new MailboxCryptoError("unreadable token");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
    throw new MailboxCryptoError("unreadable token");
  }
  const key = tokenKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, wrong context or a changed byte: never say which.
    throw new MailboxCryptoError("token failed authentication");
  }
}
