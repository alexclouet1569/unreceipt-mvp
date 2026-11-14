// What the founder's customer page (/admin/[userId]) may show of a
// customer's recent receipts. Forwarded, photographed and pasted ones as
// they are; receipts read from a connected Gmail/Outlook mailbox only as a
// count (no merchant, amount, date or original): the customer chose what to
// forward, not every receipt in their mailbox. Pure.

import type { Receipt } from "@/lib/types";

export function splitForAdmin<R extends Pick<Receipt, "intake_channel">>(
  receipts: readonly R[]
): { shown: R[]; mailboxCount: number } {
  const shown = receipts.filter((r) => r.intake_channel !== "mailbox");
  return { shown, mailboxCount: receipts.length - shown.length };
}
