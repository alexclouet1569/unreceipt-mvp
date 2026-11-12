"use client";

import { useState } from "react";
import { ReceiptListItem } from "@/components/receipt/ReceiptListItem";
import type { Receipt } from "@/lib/types";
import { ReceiptDetailDialog } from "../../ReceiptDetailDialog";

/** The drill-down's receipts as the inbox's cards; each opens the receipt sheet. */
export function DrillList({ receipts }: { receipts: Receipt[] }) {
  const [open, setOpen] = useState<Receipt | null>(null);
  return (
    <>
      <div className="list-enter space-y-2">
        {receipts.map((r) => (
          <ReceiptListItem key={r.id} receipt={r} onClick={() => setOpen(r)} />
        ))}
      </div>
      {/* Without onChangeAction the sheet refreshes this page after a save or delete. */}
      <ReceiptDetailDialog receipt={open} onOpenChange={(o) => (o ? null : setOpen(null))} />
    </>
  );
}
