// What the receipts list shows the moment a change is saved, before the
// page's own refresh brings the server's rows (useOptimistic in the /app
// dashboard). Pure and client-safe: the server stays the source of truth,
// and the refresh replaces whatever is shown here.

import type { Receipt, ReceiptStatus } from "@/lib/types";

export type ReceiptChange =
  | {
      kind: "update";
      id: string;
      patch: Record<string, unknown>;
      status?: ReceiptStatus;
      /** The company's currency, for a typed home amount. */
      homeCurrency?: string | null;
    }
  | { kind: "remove"; id: string };

/**
 * A receipt with a PATCH body from the edit form applied (the body's keys
 * are the route's, see buildPatchBody). Changing the amount, currency or
 * date drops the conversion, as the receipts_clear_stale_fx trigger does on
 * the server; a typed home amount becomes a manual conversion.
 */
export function applyPatch(
  receipt: Receipt,
  patch: Record<string, unknown>,
  status?: ReceiptStatus,
  homeCurrency?: string | null,
): Receipt {
  const next: Receipt = { ...receipt };
  if (typeof patch.merchant === "string") next.merchant_name = patch.merchant;
  if (typeof patch.amount === "number") next.total = patch.amount;
  if (typeof patch.currency === "string") next.currency = patch.currency;
  if (typeof patch.receipt_date === "string") next.receipt_date = patch.receipt_date;
  if (typeof patch.category === "string") next.category = patch.category as Receipt["category"];
  if ("notes" in patch) next.notes = (patch.notes as string | null) ?? null;
  if ("tax_amount" in patch) next.tax_amount = (patch.tax_amount as number | null) ?? null;
  if ("tax_rate" in patch) next.tax_rate = (patch.tax_rate as number | null) ?? null;
  if ("payment_method" in patch) next.payment_method = (patch.payment_method as string | null) ?? null;
  if ("items" in patch) next.items = (patch.items as Receipt["items"]) ?? null;

  const conversionStale =
    patch.home_total === null || "amount" in patch || "currency" in patch || "receipt_date" in patch;
  if (conversionStale) {
    next.home_total = null;
    next.home_currency = null;
    next.fx_rate = null;
    next.fx_date = null;
    next.fx_source = null;
  }
  if (typeof patch.home_total === "number") {
    next.home_total = patch.home_total;
    next.home_currency = homeCurrency ?? receipt.home_currency;
    next.fx_source = "manual";
    next.fx_date = null;
  }
  if (status) next.status = status;
  return next;
}

/** The list with one change applied; an id not in the list leaves it as it is. */
export function applyReceiptChange(list: Receipt[], change: ReceiptChange): Receipt[] {
  if (change.kind === "remove") return list.filter((r) => r.id !== change.id);
  return list.map((r) => (r.id === change.id ? applyPatch(r, change.patch, change.status, change.homeCurrency) : r));
}
