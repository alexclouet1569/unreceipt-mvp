// The address every email UnReceipt sends comes from, and how to recognise
// one when it comes back in. Pure; no server imports, so both the sender
// (./send.ts) and the intake (./ingest.ts) read the same constant.
//
// Why it matters: a client's Gmail rule that forwards "receipt" emails to
// their UnReceipt address also matches our own mail ("<firm> wants to see
// your receipts", the Monday reminder, "3 receipts missing…"), and a
// connected mailbox would select the same subjects. Read as receipts, they
// became junk "Unknown" receipts in Review needed (first seen 2026-11-16 in
// the pilot dry run). Our own mail is never a receipt.

export const OWN_SENDER_ADDRESS = "hello@unreceipt.com";

/**
 * The bare address of a From value: `Name <a@b>`, `<a@b>` or `a@b`,
 * lower-cased; null when there is none.
 */
function addressOf(from: string): string | null {
  const angled = /<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(from);
  const bare = angled ? angled[1] : from.trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(bare)) return null;
  return bare.toLowerCase();
}

/**
 * True when the email was sent by UnReceipt itself. Only the exact sending
 * address counts, not the whole domain: the founder's own @unreceipt.com
 * mailbox may forward real receipts. A forged From can only make its own
 * sender's email be ignored, never another person's.
 */
export function isOwnEmail(from: string | null | undefined): boolean {
  if (!from) return false;
  return addressOf(from) === OWN_SENDER_ADDRESS;
}

/** Senders that never send a receipt: GitHub's notifications (its billing
 *  receipts come from other addresses). The mailbox rules skip it too
 *  (../mailboxes/select.ts IGNORED_SENDERS). */
const NEVER_RECEIPT_SENDERS = ["notifications@github.com"];

export function isNotificationSender(from: string | null | undefined): boolean {
  if (!from) return false;
  const address = addressOf(from);
  return address !== null && NEVER_RECEIPT_SENDERS.includes(address);
}

/**
 * The message's own top-level List-Id header (RFC 2919) is set: it came
 * through a mailing list, a notification feed or a group (Google Groups
 * add one to everything they pass on, receipts included). Not a reason on
 * its own to drop an email: ingest keeps one whose subject names a receipt
 * or that carries a real attached file.
 */
export function hasListId(listIds: string[] | null): boolean {
  return (listIds ?? []).some((v) => v.trim() !== "");
}
