// SERVER-ONLY. AES-256-GCM for OAuth tokens kept in the database (connected
// mailboxes, accounting connections), so the database never holds a usable
// token. Each use names its own key variable and context prefix: a mailbox
// token and a Fortnox token never share a key, and a token copied onto
// another row (another user, another organisation) fails to decrypt.
//
// Format: "v1.<iv>.<tag>.<ciphertext>", each part base64url. The version
// lets a later key or algorithm live next to v1 rows. Any change to the
// ciphertext, tag, iv or context throws.

import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const B64URL = /^[A-Za-z0-9_-]+$/;

export type TokenCipher = {
  encryptToken(plaintext: string, context: string): string;
  decryptToken(blob: string, context: string): string;
  tokenKeyConfigured(): boolean;
};

export function createTokenCipher(options: {
  /** Name of the env var holding the 32-byte base64 key. */
  envVar: string;
  /** Bound into the additional authenticated data with the context. */
  aadPrefix: string;
  /** The error every failure throws (the caller's own class). */
  makeError: (message: string) => Error;
}): TokenCipher {
  const { envVar, aadPrefix, makeError } = options;

  function tokenKey(): Buffer {
    const raw = process.env[envVar]?.trim();
    if (!raw) throw makeError(`${envVar} is not set (openssl rand -base64 32)`);
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) throw makeError(`${envVar} must be base64`);
    const key = Buffer.from(raw, "base64");
    if (key.length !== KEY_BYTES) throw makeError(`${envVar} must decode to ${KEY_BYTES} bytes`);
    return key;
  }

  const aad = (context: string) => Buffer.from(`${aadPrefix}:${context}`, "utf8");

  return {
    tokenKeyConfigured() {
      try {
        tokenKey();
        return true;
      } catch {
        return false;
      }
    },

    encryptToken(plaintext, context) {
      if (!plaintext) throw makeError("nothing to encrypt");
      if (!context) throw makeError("missing context");
      const key = tokenKey();
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(aad(context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
    },

    decryptToken(blob, context) {
      if (!context) throw makeError("missing context");
      const parts = typeof blob === "string" ? blob.split(".") : [];
      if (parts.length !== 4 || parts[0] !== VERSION || !parts.slice(1).every((p) => B64URL.test(p))) {
        throw makeError("unreadable token");
      }
      const iv = Buffer.from(parts[1], "base64url");
      const tag = Buffer.from(parts[2], "base64url");
      const ciphertext = Buffer.from(parts[3], "base64url");
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
        throw makeError("unreadable token");
      }
      const key = tokenKey();
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
        decipher.setAAD(aad(context));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      } catch {
        // Wrong key, wrong context or a changed byte: never say which.
        throw makeError("token failed authentication");
      }
    },
  };
}
