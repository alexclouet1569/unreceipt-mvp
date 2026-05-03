"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { ReceiptDetailCard } from "@/components/receipt/ReceiptDetailCard";
import { getSupabaseClient } from "@/lib/supabase-client";
import type { Receipt } from "@/lib/types";

type ReceiptDetailDialogProps = {
  receipt: Receipt | null;
  onOpenChange: (open: boolean) => void;
};

export function ReceiptDetailDialog({
  receipt,
  onOpenChange,
}: ReceiptDetailDialogProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reset transient state every time the underlying receipt changes (i.e.
  // a different row gets opened) AND on close. CQ2: a stale error from a
  // failed attempt on receipt A must not leak into the next-opened B.
  useEffect(() => {
    setConfirming(false);
    setDeleting(false);
    setDeleteError(null);
  }, [receipt?.id]);

  const open = receipt !== null;

  const handleDelete = async () => {
    if (!receipt) return;
    setDeleteError(null);
    setDeleting(true);

    const supabase = getSupabaseClient();

    try {
      // Storage delete first per spec — if the row gets removed before the
      // image, a transient storage failure leaves the image orphaned with
      // no row to track it back to. Storage-then-row order keeps the
      // failure modes recoverable.
      if (receipt.image_url) {
        const { error: storageError } = await supabase.storage
          .from("receipts")
          .remove([receipt.image_url]);
        if (storageError) {
          // Supabase Storage is permissive about missing keys (idempotent
          // delete). A real error means a transient backend failure —
          // abort so we don't desync the row from a still-present image.
          throw storageError;
        }
      }

      const { error: rowError } = await supabase
        .from("receipts")
        .delete()
        .eq("id", receipt.id);

      if (rowError) {
        // Image is already gone but the row failed. Surface the error and
        // let the user retry. The retry's storage call will be a no-op
        // (key not found is treated as success by Supabase) so the second
        // row delete is the only thing that has to succeed.
        throw rowError;
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      // TODO(step-11): Sentry.captureException(err, { tags: { area: "/app delete" } });
      console.error("[/app] delete failed", err);
      setDeleteError("Could not delete receipt. Try again in a moment.");
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>

        {receipt ? (
          <div className="space-y-4">
            <ReceiptDetailCard receipt={receipt} />

            {deleteError ? (
              <p
                role="alert"
                className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
              >
                {deleteError}
              </p>
            ) : null}

            {confirming ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setConfirming(false);
                    setDeleteError(null);
                  }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {deleting
                    ? "Deleting…"
                    : deleteError
                      ? "Try again"
                      : "Confirm delete"}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="w-4 h-4" />
                Delete receipt
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
