// Which of a client's receipts the accounting firm may see (founder decision,
// 2026-11-13): every receipt, except one read from a connected Gmail/Outlook
// mailbox that the owner hasn't confirmed yet. A mailbox reads more than the
// owner chose to send (a forwarding rule is the owner's own filter), so its
// receipts stay the owner's until they press Confirm (status 'verified').
//
// One rule, two forms: a PostgREST filter for queries and a predicate for a
// row already read. Every firm read path uses one of them (firm client pages,
// firm exports, bank matching, weekly reminders, loadReceiptForActor for the
// firm). Owner-side views never use it. Pure: no I/O, client-safe.

import type { Receipt, ReceiptStatus } from "@/lib/types";

/**
 * PostgREST `or` filter for the rows a firm may read: not from a mailbox
 * (NULL is any other path), or confirmed. `neq` is false for NULL, hence the
 * explicit `is.null`. Combined with other `.or()` calls by AND.
 */
export const FIRM_VISIBLE_FILTER =
  "intake_channel.is.null,intake_channel.neq.mailbox,status.eq.verified";

/** Adds the firm-visibility filter to a receipts query (select or update). */
export function firmVisible<Q extends { or: (filters: string) => Q }>(query: Q): Q {
  return query.or(FIRM_VISIBLE_FILTER);
}

/** The same rule for a row already read. */
export function isFirmVisible(
  receipt: Pick<Receipt, "intake_channel"> & { status: ReceiptStatus | string }
): boolean {
  return receipt.intake_channel !== "mailbox" || receipt.status === "verified";
}
