// SERVER-ONLY. The Gmail adapter (MailboxProvider, ./types.ts).
// STUB: written in step 3 of the connected-mailboxes plan. Until then it
// reports itself unconfigured, so /api/mailboxes/connect/google answers 404 and
// nothing else here is ever called.

import { MailboxProviderError, type MailboxProvider } from "./types";

const notImplemented = (): never => {
  throw new MailboxProviderError("not_implemented");
};

export const googleProvider: MailboxProvider = {
  id: "google",
  configured: () => false,
  authUrl: notImplemented,
  exchangeCode: async () => notImplemented(),
  refreshAccessToken: async () => notImplemented(),
  revoke: async () => {},
  startWatch: async () => notImplemented(),
  stopWatch: async () => {},
  sync: async () => notImplemented(),
};
