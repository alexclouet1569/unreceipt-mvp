// A receipt's screens exist in three tabs: Receipts (/receipt/…), Insights
// (/insights/receipt/…) and Clients (/clients/receipt/…, an accounting
// firm's view of its clients' receipts), so opening one stays in that tab's
// stack instead of jumping to Receipts. `firm`: the receipt is a client's,
// opened by its accountant: no Delete (only the owner deletes), and edits
// and Confirm go through the same routes, which check the firm's access.

import { usePathname } from "expo-router";

export type ReceiptRoutes = { detail: string; edit: string; photo: string; firm: boolean };

export function receiptRoutesFor(pathname: string): ReceiptRoutes {
  const base = pathname.startsWith("/insights")
    ? "/insights/receipt"
    : pathname.startsWith("/clients")
      ? "/clients/receipt"
      : "/receipt";
  return {
    detail: `${base}/[id]`,
    edit: `${base}/edit`,
    photo: `${base}/photo`,
    firm: base === "/clients/receipt",
  };
}

export function useReceiptRoutes(): ReceiptRoutes {
  return receiptRoutesFor(usePathname());
}
