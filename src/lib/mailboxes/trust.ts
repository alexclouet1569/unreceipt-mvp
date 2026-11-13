// How much a message read from a connected mailbox is trusted (the TrustInput
// of ingestReceiptEmail, src/lib/email/ingest.ts).
//
// PLACEHOLDER (2026-11-13): trusts nothing, so every mailbox receipt lands in
// "Review needed". The Gmail step replaces it with the real check: the DMARC
// verdict from the receiving provider's own topmost Authentication-Results
// header (mx.google.com / Outlook's servers), and the To: header naming the
// connected address. Callers already pass everything that check needs.

import type { TrustInput } from "@/lib/email/ingest";
import type { MailboxProviderId } from "@/lib/types";

export function mailboxTrust(_input: {
  rawEml: Buffer;
  provider: MailboxProviderId;
  // The connected address (mailbox_connections.email).
  mailboxEmail: string;
}): TrustInput {
  return { dmarc: null, recipient: { from: "given", ownership: "none" } };
}
