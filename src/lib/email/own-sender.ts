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

/**
 * A mailing-list or notification email (it carries a List-Id header,
 * RFC 2919: GitHub, Google Groups, newsletters) or a reply in a
 * conversation ("Re:", "Sv:", "AW:"…; ../mailboxes/select.ts isReply()).
 * Neither is a receipt on its own; ingest still reads one that carries a
 * PDF or photo. Read from the message's own top-level headers, so a
 * receipt the user forwards by hand ("Fwd: …", sent by them, no List-Id)
 * is never caught; an automatic forwarding rule keeps the original
 * headers, which is where a GitHub notification about a "receipt" pull
 * request came from (2026-11-16, pilot dry run).
 */
export function isListOrReply(message: { reply: boolean; listIds: string[] | null }): boolean {
  return message.reply || (message.listIds ?? []).some((v) => v.trim() !== "");
}

