"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { ReceiptDetailCard } from "@/components/receipt/ReceiptDetailCard";
import { OriginalSourceViewer } from "@/components/receipt/OriginalSourceViewer";
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
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Fresh action state for each receipt opened (adjusted during render,
  // React's "reset state when a prop changes" pattern).
  const [prevReceiptId, setPrevReceiptId] = useState(receipt?.id);
  if (receipt?.id !== prevReceiptId) {
    setPrevReceiptId(receipt?.id);
    setConfirming(false);
    setDeleting(false);
    setDeleteError(null);
    setReprocessing(false);
    setReprocessError(null);
    setEditing(false);
  }

  const open = receipt !== null;
  const pending = receipt?.status === "pending_review";
  // Manual rows are user-typed and have no source artifact — hide the
  // Original tab entirely. Every other intake path stores a raw
  // artifact (paper photo, email .eml, SMS .txt) we can show.
  const hasOriginal = receipt != null && receipt.source !== "manual";

  // "Re-run extraction" makes sense when the row has an OCR-eligible
  // artifact (image/PDF) AND the digital twin is still thin — either
  // it never got line items, the parser flagged low confidence, or
  // it's still pending_review. eml/txt artifacts go through the email
  // parser, not /api/ocr, so they don't show this button.
  const isOcrEligibleArtifact =
    receipt != null &&
    (receipt.image_url != null ||
      (receipt.original_source_kind != null &&
        receipt.original_source_kind.startsWith("image/")) ||
      receipt.original_source_kind === "application/pdf");
  const couldReprocess =
    receipt != null &&
    isOcrEligibleArtifact &&
    ((receipt.items == null || receipt.items.length === 0) ||
      (receipt.parse_confidence != null && receipt.parse_confidence < 0.75) ||
      receipt.status === "pending_review");

  const handleReprocess = async () => {
    if (!receipt) return;
    setReprocessError(null);
    setReprocessing(true);
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/reprocess`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `Re-run failed (HTTP ${res.status})`);
      }
      router.refresh();
    } catch (err) {
      console.error("[/app] reprocess failed", err);
      setReprocessError(
        err instanceof Error
          ? err.message
          : "Couldn't re-run extraction. Try again in a moment."
      );
    } finally {
      setReprocessing(false);
    }
  };

  const handleDelete = async () => {
    if (!receipt) return;
    setDeleteError(null);
    setDeleting(true);

    try {
      // Server-side so the forwarded email / PDF original is deleted too —
      // the browser can't remove files from `receipt-originals`.
      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`delete failed (HTTP ${res.status})`);
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("[/app] delete failed", err);
      setDeleteError("Could not delete receipt. Try again in a moment.");
      setDeleting(false);
    }
  };

  const onSaved = () => {
    onOpenChange(false);
    router.refresh();
  };
  // Pending receipts always show the "complete" form; any receipt can be
  // corrected through the same form in "edit" mode.
  const form =
    receipt == null ? null : pending ? (
      <ReceiptEditForm mode="complete" receipt={receipt} onSaved={onSaved} />
    ) : editing ? (
      <ReceiptEditForm
        mode="edit"
        receipt={receipt}
        onSaved={onSaved}
        onCancel={() => setEditing(false)}
      />
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>

        {receipt ? (
          <div>
            {hasOriginal ? (
              <Tabs defaultValue="digital" className="gap-0">
                <div className="px-4 pt-3 pb-2 border-b border-[var(--hairline)]">
                  <TabsList className="w-full" variant="line">
                    <TabsTrigger value="digital">Digital</TabsTrigger>
                    <TabsTrigger value="original">Original</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="digital">
                  <ReceiptDetailCard receipt={receipt} />
                  {form}
                </TabsContent>
                <TabsContent value="original">
                  <OriginalSourceViewer receiptId={receipt.id} />
                </TabsContent>
              </Tabs>
            ) : (
              <>
                <ReceiptDetailCard receipt={receipt} />
                {form}
              </>
            )}

            {editing ? null : (
            <div className="px-4 py-4 space-y-3 border-t border-[var(--hairline)]">
              {couldReprocess ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-1.5"
                    onClick={handleReprocess}
                    disabled={reprocessing}
                    data-testid="receipt-reprocess-button"
                  >
                    {reprocessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {reprocessing ? "Reading receipt…" : "Re-run extraction"}
                  </Button>
                  {reprocessError ? (
                    <p
                      role="alert"
                      className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
                    >
                      {reprocessError}
                    </p>
                  ) : null}
                </>
              ) : null}

              {pending ? (
                <p
                  className="text-[var(--attention-deep)] font-accent italic text-center"
                  style={{ fontSize: "13px" }}
                >
                  Complete this receipt to download
                </p>
              ) : (
                <>
                  {/* Plain anchor with `download` so the browser's own
                      download manager handles it (iOS Safari ignores
                      fetch+blob downloads triggered from JS). */}
                  <a
                    href={`/api/receipts/${receipt.id}/pdf`}
                    download
                    data-testid="receipt-download-link"
                    className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-[10px] bg-primary text-primary-foreground text-[14px] font-semibold transition-colors hover:bg-[var(--brand-deep)]"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 gap-1.5"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="w-4 h-4" />
                    Edit receipt
                  </Button>
                </>
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
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type EditFormState = {
  merchant: string;
  amount: string;
  currency: CurrencyCode;
  date: string;
  category: CategoryKey;
  notes: string;
};

function deriveFormState(receipt: Receipt): EditFormState {
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
    notes: receipt.notes ?? "",
  };
}

/**
 * The PATCH body: only the fields the user changed, so an untouched field
 * is never rewritten (or recorded as edited). Throws a readable message
 * when a required field is invalid.
 */
export function buildPatchBody(
  initial: EditFormState,
  form: EditFormState,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (form.merchant.trim() !== initial.merchant.trim()) {
    if (!form.merchant.trim()) throw new Error("Merchant is required");
    body.merchant = form.merchant.trim();
  }
  if (form.amount !== initial.amount) {
    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter a valid amount greater than 0");
    }
    body.amount = amount;
  }
  if (form.currency !== initial.currency) body.currency = form.currency;
  if (form.date !== initial.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) throw new Error("Date is required");
    body.receipt_date = form.date;
  }
  if (form.category !== initial.category) body.category = form.category;
  if (form.notes.trim() !== initial.notes.trim()) {
    body.notes = form.notes.trim() || null;
  }
  return body;
}

const LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]";
const SELECT_CLASS = "h-11 w-full rounded-md border bg-card px-3 text-sm";

function ReceiptEditForm({
  mode,
  receipt,
  onSaved,
  onCancel,
}: {
  mode: "complete" | "edit";
  receipt: Receipt;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [initial, setInitial] = useState<EditFormState>(() =>
    deriveFormState(receipt),
  );
  const [form, setForm] = useState<EditFormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevReceipt, setPrevReceipt] = useState(receipt);
  if (receipt !== prevReceipt) {
    setPrevReceipt(receipt);
    const next = deriveFormState(receipt);
    setInitial(next);
    setForm(next);
    setError(null);
  }

  const update = <K extends keyof EditFormState>(
    key: K,
    value: EditFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let body: Record<string, unknown>;
    try {
      if (mode === "complete") {
        // Completing needs every required field, changed or not.
        if (!form.merchant.trim()) throw new Error("Merchant is required");
        const amount = Number(form.amount.replace(",", "."));
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error("Enter a valid amount greater than 0");
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
          throw new Error("Date is required");
        }
      }
      body = buildPatchBody(initial, form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check the fields");
      return;
    }

    if (mode === "edit" && Object.keys(body).length === 0) {
      onCancel?.();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const resBody = (await res.json().catch(() => ({}))) as {
          error?: string;
          issues?: Array<{ message?: string }>;
        };
        throw new Error(
          resBody.issues?.[0]?.message ??
            resBody.error ??
            `Save failed (HTTP ${res.status})`,
        );
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  const id = (field: string) => `edit-${receipt.id}-${field}`;
  const isEdit = mode === "edit";

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-4 space-y-3 border-t border-[var(--hairline)]"
      style={isEdit ? undefined : { background: "var(--attention-tint)" }}
      aria-label={isEdit ? "Edit receipt" : "Complete receipt"}
    >
      <p
        className={isEdit ? "text-[var(--ink)]" : "text-[var(--attention-deep)]"}
        style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
      >
        {isEdit ? "Edit receipt" : "Review needed"}
      </p>
      <p
        className="text-[var(--ink-muted)]"
        style={{ fontSize: "13px", lineHeight: 1.5 }}
      >
        {isEdit
          ? "Correct anything that was read wrong. The original file stays as it is, and the PDF will show which fields you changed."
          : "Fill the missing fields below so this receipt becomes downloadable."}
      </p>

      <div className="space-y-2">
        <label htmlFor={id("merchant")} className={LABEL_CLASS}>
          Merchant
        </label>
        <Input
          id={id("merchant")}
          className="h-11"
          value={form.merchant}
          onChange={(e) => update("merchant", e.target.value)}
          placeholder="ICA Maxi"
          maxLength={200}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label htmlFor={id("amount")} className={LABEL_CLASS}>
            Amount
          </label>
          <Input
            id={id("amount")}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => update("amount", e.target.value)}
            className="h-11 font-mono tabular-nums"
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={id("date")} className={LABEL_CLASS}>
            Date
          </label>
          <Input
            id={id("date")}
            type="date"
            className="h-11"
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label htmlFor={id("currency")} className={LABEL_CLASS}>
            Currency
          </label>
          <select
            id={id("currency")}
            className={SELECT_CLASS}
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
          <label htmlFor={id("category")} className={LABEL_CLASS}>
            Category
          </label>
          <select
            id={id("category")}
            className={SELECT_CLASS}
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

      {isEdit ? (
        <div className="space-y-2">
          <label htmlFor={id("notes")} className={LABEL_CLASS}>
            Notes
          </label>
          <textarea
            id={id("notes")}
            className="w-full min-h-[60px] rounded-md border bg-card px-3 py-2 text-sm"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            maxLength={2000}
          />
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
        >
          {error}
        </p>
      ) : null}

      {isEdit ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1 h-11 gap-1.5" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <Button type="submit" className="w-full h-11 gap-1.5" disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? "Saving…" : "Complete receipt"}
        </Button>
      )}
    </form>
  );
}
