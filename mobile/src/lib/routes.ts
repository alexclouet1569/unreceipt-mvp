// A receipt's screens exist in two tabs: Receipts (/receipt/…) and
// Insights (/insights/receipt/…), so opening one from Insights stays in
// that tab's stack instead of jumping to Receipts.

import { usePathname } from "expo-router";

export type ReceiptRoutes = { detail: string; edit: string; photo: string };

export function receiptRoutesFor(pathname: string): ReceiptRoutes {
  const base = pathname.startsWith("/insights") ? "/insights/receipt" : "/receipt";
  return { detail: `${base}/[id]`, edit: `${base}/edit`, photo: `${base}/photo` };
}

export function useReceiptRoutes(): ReceiptRoutes {
  return receiptRoutesFor(usePathname());
}
