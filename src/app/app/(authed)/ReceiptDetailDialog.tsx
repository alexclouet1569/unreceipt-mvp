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
import { Input } from "@/components/ui/input";
import { Download, Loader2, Trash2 } from "lucide-react";
import { ReceiptDetailCard } from "@/components/receipt/ReceiptDetailCard";
import { getSupabaseClient } from "@/lib/supabase-client";
import {
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  CURRENCY_OPTIONS,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/receipt-format";
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

  useEffect(() => {
    setConfirming(false);
    setDeleting(false);
    setDeleteError(null);
  }, [receipt?.id]);

  const open = receipt !== null;
  const pending = receipt?.status === "pending_review";

  const handleDelete = async () => {
    if (!receipt) return;
    setDeleteError(null);
    setDeleting(true);

    const supabase = getSupabaseClient();

    try {
      if (receipt.image_url) {
        const { error: storageError } = await supabase.storage
          .from("receipts")
          .remove([receipt.image_url]);
        if (storageError) {
          throw storageError;
        }
      }

      const { error: rowError } = await supabase
        .from("receipts")
        .delete()
        .eq("id", receipt.id);

      if (rowError) {
        throw rowError;
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("[/app] delete failed", err);
      setDeleteError("Could not delete receipt. Try again in a moment.");
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>

        {receipt ? (
          <div>
            <ReceiptDetailCard receipt={receipt} />

            {pending ? (
              <CompleteForm
                receipt={receipt}
                onSaved={() => {
                  onOpenChange(false);
                  router.refresh();
                }}
              />
            ) : null}

            <div className="px-4 py-4 space-y-3 border-t border-[var(--hairline)]">
              {pending ? (
                <p
                  className="text-[var(--attention-deep)] font-accent italic text-center"
                  style={{ fontSize: "13px" }}
                >
                  Complete this receipt to download
                </p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => {
                    window.location.href = `/api/receipts/${receipt.id}/pdf`;
                  }}
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              )}

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
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type CompleteFormState = {
  merchant: string;
  amount: string;
  currency: CurrencyCode;
  date: string;
  category: CategoryKey;
};

function deriveFormState(receipt: Receipt): CompleteFormState {
  const isoDate =
    receipt.purchased_at?.slice(0, 10) ?? receipt.receipt_date ?? "";
  return {
    merchant: receipt.merchant_name ?? "",
    amount: receipt.total != null ? String(receipt.total) : "",
    currency: (CURRENCY_OPTIONS as readonly string[]).includes(receipt.currency)
      ? (receipt.currency as CurrencyCode)
      : "EUR",
    date: isoDate,
    category: receipt.category,
  };
}

function CompleteForm({
  receipt,
  onSaved,
}: {
  receipt: Receipt;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CompleteFormState>(() =>
    deriveFormState(receipt),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(deriveFormState(receipt));
    setError(null);
  }, [receipt]);

  const update = <K extends keyof CompleteFormState>(
    key: K,
    value: CompleteFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid amount greater than 0");
      }
      if (!form.merchant.trim()) {
        throw new Error("Merchant is required");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
        throw new Error("Date is required");
      }

      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          merchant: form.merchant.trim(),
          amount,
          currency: form.currency,
          receipt_date: form.date,
          category: form.category,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (HTTP ${res.status})`);
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-4 space-y-3 border-t border-[var(--hairline)]"
      style={{ background: "var(--attention-tint)" }}
    >
      <p
        className="text-[var(--attention-deep)]"
        style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
      >
        Review needed
      </p>
      <p
        className="text-[var(--ink-muted)]"
        style={{ fontSize: "13px", lineHeight: 1.5 }}
      >
        Fill the missing fields below so this receipt becomes downloadable.
      </p>

      <div className="space-y-2">
        <label
          htmlFor={`cmp-${receipt.id}-merchant`}
          className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]"
        >
          Merchant
        </label>
        <Input
          id={`cmp-${receipt.id}-merchant`}
          value={form.merchant}
          onChange={(e) => update("merchant", e.target.value)}
          placeholder="ICA Maxi"
          maxLength={200}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label
            htmlFor={`cmp-${receipt.id}-amount`}
            className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]"
          >
            Amount
          </label>
          <Input
            id={`cmp-${receipt.id}-amount`}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => update("amount", e.target.value)}
            className="font-mono tabular-nums"
            required
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor={`cmp-${receipt.id}-date`}
            className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]"
          >
            Date
          </label>
          <Input
            id={`cmp-${receipt.id}-date`}
            type="date"
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label
            htmlFor={`cmp-${receipt.id}-currency`}
            className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]"
          >
            Currency
          </label>
          <select
            id={`cmp-${receipt.id}-currency`}
            className="h-9 w-full rounded-md border bg-card px-3 text-sm"
            value={form.currency}
            onChange={(e) => update("currency", e.target.value as CurrencyCode)}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label
            htmlFor={`cmp-${receipt.id}-category`}
            className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]"
          >
            Category
          </label>
          <select
            id={`cmp-${receipt.id}-category`}
            className="h-9 w-full rounded-md border bg-card px-3 text-sm"
            value={form.category}
            onChange={(e) => update("category", e.target.value as CategoryKey)}
          >
            {CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_CONFIG[k].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full gap-1.5" disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saving ? "Saving…" : "Complete receipt"}
      </Button>
    </form>
  );
}
