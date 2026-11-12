// The digital receipt's extra fields (items, VAT, payment, stamp) for the
// receipt screen: the last answer at once (kept in memory per receipt),
// then GET /api/mobile/receipts/[id]. Asked again when the receipt itself
// changes on the phone (an edit, a confirmation), so VAT and the stamp
// follow. The screen draws merchant, amount, date and category from the
// list's copy, which already carries the phone's edits.

import { useEffect, useState } from "react";
import type { MobileReceipt, MobileReceiptDetail } from "@/lib/mobile/types";
import { getReceiptDetail } from "./api";
import { onSignOutClear } from "./cache";

const seen = new Map<string, MobileReceiptDetail>();
const MAX_SEEN = 40;
onSignOutClear(() => seen.clear());

function remember(id: string, d: MobileReceiptDetail) {
  seen.delete(id);
  seen.set(id, d);
  while (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value as string);
}

/** What on the list's copy should make the detail be asked again. */
function signature(r: MobileReceipt | undefined): string {
  if (!r) return "";
  return [r.status, r.merchant, r.total, r.currency, r.date, r.category, r.homeTotal, r.notes].join("|");
}

export function useReceiptDetail(id: string, live: MobileReceipt | undefined): MobileReceiptDetail | null {
  const [detail, setDetail] = useState<MobileReceiptDetail | null>(() => seen.get(id) ?? null);
  const sig = signature(live);
  useEffect(() => {
    if (!sig) return;
    let alive = true;
    // Right after a save the server may still be writing: a short wait
    // keeps the answer from being the old row.
    const t = setTimeout(() => {
      getReceiptDetail(id)
        .then((d) => {
          remember(id, d);
          if (alive) setDetail(d);
        })
        .catch(() => {
          // Offline or refused: the screen keeps what it shows (the list's fields).
        });
    }, seen.has(id) ? 600 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [id, sig]);
  return detail;
}
