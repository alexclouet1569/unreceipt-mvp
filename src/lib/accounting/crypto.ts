// SERVER-ONLY. Encrypts accounting tokens (accounting_connections) with
// their own key, INTEGRATION_TOKEN_KEY, never the mailbox key. The context
// is the organisation id: a token copied onto another company's row fails
// to decrypt.

import "server-only";

import { createTokenCipher } from "@/lib/crypto/token-cipher";

export class AccountingCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountingCryptoError";
  }
}

const cipher = createTokenCipher({
  envVar: "INTEGRATION_TOKEN_KEY",
  aadPrefix: "unreceipt-accounting",
  makeError: (message) => new AccountingCryptoError(message),
});

export const integrationKeyConfigured = cipher.tokenKeyConfigured;
export const encryptAccountingToken = cipher.encryptToken;
export const decryptAccountingToken = cipher.decryptToken;
