// SERVER-ONLY. Encrypts the refresh tokens of connected mailboxes
// (mailbox_connections.refresh_token_enc) with AES-256-GCM, so the database
// never holds a usable token. Never import from a "use client" file:
// MAILBOX_TOKEN_KEY is not NEXT_PUBLIC_*, so a stray client import finds no
// key and every call throws.
//
// The cipher itself is shared (src/lib/crypto/token-cipher.ts). A context
// string (the owner's user id) is bound as additional authenticated data:
// a token copied onto another user's row fails to decrypt.

import "server-only";

import { createTokenCipher } from "@/lib/crypto/token-cipher";

export class MailboxCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailboxCryptoError";
  }
}

const cipher = createTokenCipher({
  envVar: "MAILBOX_TOKEN_KEY",
  aadPrefix: "unreceipt-mailbox",
  makeError: (message) => new MailboxCryptoError(message),
});

/** True when MAILBOX_TOKEN_KEY is present and the right length. */
export const tokenKeyConfigured = cipher.tokenKeyConfigured;
export const encryptToken = cipher.encryptToken;
export const decryptToken = cipher.decryptToken;
