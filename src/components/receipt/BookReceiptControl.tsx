"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInstantDate } from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";

/**
 * Firm-only: "Mark as booked" with an optional verification reference, or
 * the booked state with a way to undo it. Posts to the client's booking
 * route; the organisation id comes from the receipt itself.
 */
export function BookReceiptControl({ receipt }: { receipt: Receipt }) {
  const router = useRouter();
  const [ref, setRef] = useState(receipt.booked_ref ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!receipt.organization_id) return null;

  const call = async (booked: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/firm/clients/${encodeURIComponent(receipt.organization_id!)}/receipts/book`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ receiptIds: [receipt.id], ref: ref.trim(), booked }),
        }
      );
      if (!res.ok) {
        setError("Couldn't update. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't update. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (receipt.booked_at) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-[var(--ink)]" style={{ fontSize: "14px" }}>
          <BookCheck className="w-4 h-4 text-[var(--ink)]" aria-hidden="true" />
          Booked {formatInstantDate(receipt.booked_at)}
          {receipt.booked_ref ? ` · ref ${receipt.booked_ref}` : ""}
        </p>
        <Button type="button" variant="outline" className="w-full h-11" onClick={() => call(false)} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Undo booked
        </Button>
        {error ? <p role="alert" className="text-sm text-[var(--attention-deep)]">{error}</p> : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void call(true);
      }}
    >
      <label htmlFor={`book-ref-${receipt.id}`} className="block text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
        Verification reference (optional)
      </label>
      <div className="flex gap-2">
        <Input
          id={`book-ref-${receipt.id}`}
          className="h-11 flex-1"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          maxLength={60}
          placeholder="Verification no."
        />
        <Button type="submit" className="h-11 gap-1.5" disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookCheck className="w-4 h-4" />}
          Mark as booked
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-[var(--attention-deep)]">{error}</p> : null}
    </form>
  );
}
