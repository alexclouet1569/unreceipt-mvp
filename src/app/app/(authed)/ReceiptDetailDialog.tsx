"use client";

import { useEffect, useRef, useState } from "react";
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
import { Download, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { ReceiptDetailCard } from "@/components/receipt/ReceiptDetailCard";
import { OriginalSourceViewer } from "@/components/receipt/OriginalSourceViewer";
import {
  CATEGORY_KEYS,
  CURRENCY_OPTIONS,
  formatAmount,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/receipt-format";
import {
  MAX_ITEMS,
  PAYMENT_METHOD_SUGGESTIONS,
} from "@/lib/receipts/receipt-fields";
import type { Receipt, ReceiptItem } from "@/lib/types";
import { useI18n } from "@/lib/i18n/client";
import { getMessages, type Messages } from "@/lib/i18n/messages";

type FormErrors = Messages["receipt"]["form"]["errors"];
const EN_ERRORS: FormErrors = getMessages("en").receipt.form.errors;

type ReceiptDetailDialogProps = {
  receipt: Receipt | null;
  onOpenChange: (open: boolean) => void;
};

export function ReceiptDetailDialog({
  receipt,
  onOpenChange,
}: ReceiptDetailDialogProps) {
  const router = useRouter();
  const { locale, t: messages } = useI18n();
  const t = messages.receipt.dialog;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Cancel unmounts the form; send focus back to the Edit button.
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (!editing && wasEditing.current) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

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
      // The route's error texts are English; other languages get ours.
      setReprocessError(
        err instanceof Error && locale === "en" ? err.message : t.rerunFailed
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
      setDeleteError(t.deleteFailed);
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
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>

        {receipt ? (
          <div>
            {hasOriginal ? (
              <Tabs defaultValue="digital" className="gap-0">
                <div className="px-4 pt-3 pb-2 border-b border-[var(--hairline)]">
                  <TabsList className="w-full" variant="line">
                    <TabsTrigger value="digital">{t.tabDigital}</TabsTrigger>
                    <TabsTrigger value="original">{t.tabOriginal}</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="digital">
                  <div className="bg-[var(--surface)] px-4 pt-4 pb-6">
                    <ReceiptDetailCard receipt={receipt} />
                  </div>
                  {form}
                </TabsContent>
                <TabsContent value="original">
                  <OriginalSourceViewer receiptId={receipt.id} />
                </TabsContent>
              </Tabs>
            ) : (
              <>
                <div className="bg-[var(--surface)] px-4 pt-4 pb-6">
                  <ReceiptDetailCard receipt={receipt} />
                </div>
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
                    className="w-full h-11 gap-1.5"
                    onClick={handleReprocess}
                    disabled={reprocessing}
                    data-testid="receipt-reprocess-button"
                  >
                    {reprocessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {reprocessing ? t.reading : t.rerun}
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
                  {t.completeToDownload}
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
                    className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-[10px] bg-primary text-primary-foreground text-[14px] font-semibold transition-colors hover:bg-[var(--brand-action-deep)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Download className="w-4 h-4" />
                    {t.downloadPdf}
                  </a>
                  <Button
                    ref={editButtonRef}
                    type="button"
                    variant="outline"
                    className="w-full h-11 gap-1.5"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="w-4 h-4" />
                    {t.edit}
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
                    className="flex-1 h-11"
                    onClick={() => {
                      setConfirming(false);
                      setDeleteError(null);
                    }}
                    disabled={deleting}
                  >
                    {messages.common.cancel}
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 h-11 gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {deleting
                      ? t.deleting
                      : deleteError
                        ? messages.common.tryAgain
                        : t.confirmDelete}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  {t.delete}
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

type EditItem = {
  // Stable React key for a row (rows can be added and removed).
  key: string;
  label: string;
  total: string;
  // Kept from the extraction; not editable in this form. unit_amount is
  // dropped when the line total is changed, so it can't contradict it.
  qty: number | null;
  unit_amount: number | null;
  originalTotal: string;
};

type EditFormState = {
  merchant: string;
  amount: string;
  currency: CurrencyCode;
  date: string;
  category: CategoryKey;
  notes: string;
  taxAmount: string;
  taxRate: string;
  paymentMethod: string;
  items: EditItem[];
};

let itemKeySeq = 0;
const nextItemKey = () => `item-${++itemKeySeq}`;

function toEditItems(items: ReceiptItem[] | null): EditItem[] {
  return (items ?? []).map((it) => ({
    key: nextItemKey(),
    label: it.label,
    total: String(it.total_amount),
    qty: it.qty ?? null,
    unit_amount: it.unit_amount ?? null,
    originalTotal: String(it.total_amount),
  }));
}

function parseDecimal(value: string): number {
  return Number(value.trim().replace(",", "."));
}

/** Rows → stored items. Blank rows are dropped; invalid ones throw. */
function toReceiptItems(items: EditItem[], errors: FormErrors = EN_ERRORS): ReceiptItem[] {
  const out: ReceiptItem[] = [];
  for (const it of items) {
    const label = it.label.trim();
    if (!label && !it.total.trim()) continue;
    if (!label) throw new Error(errors.lineNeedsDescription);
    const total = parseDecimal(it.total);
    // Negative is fine: discount and deposit-return lines.
    if (!it.total.trim() || !Number.isFinite(total)) {
      throw new Error(errors.lineNeedsAmount(label));
    }
    const totalChanged = it.total.trim() !== it.originalTotal;
    out.push({
      label,
      qty: it.qty,
      unit_amount: totalChanged ? null : it.unit_amount,
      total_amount: total,
    });
  }
  return out;
}

function sameItems(a: ReceiptItem[], b: ReceiptItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function optionalDecimal(
  value: string,
  { max, message }: { max: number; message: string },
): number | null {
  if (!value.trim()) return null;
  const n = parseDecimal(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(message);
  return n;
}

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
    taxAmount: receipt.tax_amount != null ? String(receipt.tax_amount) : "",
    taxRate: receipt.tax_rate != null ? String(receipt.tax_rate) : "",
    paymentMethod: receipt.payment_method ?? "",
    items: toEditItems(receipt.items),
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
  {
    includeItems = true,
    errors = EN_ERRORS,
  }: { includeItems?: boolean; errors?: FormErrors } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (form.merchant.trim() !== initial.merchant.trim()) {
    if (!form.merchant.trim()) throw new Error(errors.merchantRequired);
    body.merchant = form.merchant.trim();
  }
  if (form.amount !== initial.amount) {
    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(errors.amountInvalid);
    }
    body.amount = amount;
  }
  if (form.currency !== initial.currency) body.currency = form.currency;
  if (form.date !== initial.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) throw new Error(errors.dateRequired);
    body.receipt_date = form.date;
  }
  if (form.category !== initial.category) body.category = form.category;
  if (form.notes.trim() !== initial.notes.trim()) {
    body.notes = form.notes.trim() || null;
  }
  if (form.taxAmount.trim() !== initial.taxAmount.trim()) {
    body.tax_amount = optionalDecimal(form.taxAmount, {
      max: 1_000_000,
      message: errors.vatAmountInvalid,
    });
  }
  if (form.taxRate.trim() !== initial.taxRate.trim()) {
    body.tax_rate = optionalDecimal(form.taxRate, {
      max: 100,
      message: errors.vatRateInvalid,
    });
  }
  if (form.paymentMethod.trim() !== initial.paymentMethod.trim()) {
    body.payment_method = form.paymentMethod.trim() || null;
  }
  if (includeItems) {
    const items = toReceiptItems(form.items, errors);
    if (!sameItems(items, toReceiptItems(initial.items, errors))) {
      body.items = items.length > 0 ? items : null;
    }
  }
  return body;
}

const LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]";
const SELECT_CLASS = "h-11 w-full rounded-md border bg-card px-3 text-base md:text-sm";

/**
 * PATCH validation errors arrive in English. English shows them as sent;
 * other languages get the matching message for the field.
 */
function serverIssueMessage(
  issue: { path?: string; message?: string } | undefined,
  errors: FormErrors,
  english: boolean,
): string | undefined {
  if (!issue) return undefined;
  if (english) return issue.message;
  const field = (issue.path ?? "").split(".")[0];
  switch (field) {
    case "merchant":
      return errors.merchantRequired;
    case "amount":
      return errors.amountInvalid;
    case "receipt_date":
      return errors.dateRequired;
    case "tax_amount":
      return /more than the total/i.test(issue.message ?? "")
        ? errors.vatExceedsTotal
        : errors.vatAmountInvalid;
    case "tax_rate":
      return errors.vatRateInvalid;
    case "payment_method":
      return errors.paymentInvalid;
    case "notes":
      return errors.notesTooLong;
    case "items":
      return errors.lineNeedsDescription;
    default:
      return errors.checkFields;
  }
}

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
  const { locale, t: messages } = useI18n();
  const t = messages.receipt.form;
  const errors = t.errors;
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
        if (!form.merchant.trim()) throw new Error(errors.merchantRequired);
        const amount = Number(form.amount.replace(",", "."));
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(errors.amountInvalid);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
          throw new Error(errors.dateRequired);
        }
      }
      // Line items are only editable (and shown) in edit mode.
      body = buildPatchBody(initial, form, { includeItems: mode === "edit", errors });
    } catch (err) {
      setError(err instanceof Error ? err.message : errors.checkFields);
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
          issues?: Array<{ path?: string; message?: string }>;
        };
        const english = locale === "en";
        throw new Error(
          serverIssueMessage(resBody.issues?.[0], errors, english) ??
            (english ? resBody.error : undefined) ??
            errors.saveFailedStatus(res.status),
        );
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : errors.saveFailed);
      setSaving(false);
    }
  };

  const updateItem = (key: string, patch: Partial<EditItem>) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    }));
  const removeItem = (key: string) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.key !== key),
    }));
  const addItem = () =>
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: nextItemKey(),
          label: "",
          total: "",
          qty: null,
          unit_amount: null,
          originalTotal: "",
        },
      ],
    }));

  const id = (field: string) => `edit-${receipt.id}-${field}`;
  const isEdit = mode === "edit";

  // Gentle consistency hint: when line items don't add up to the total,
  // say so (it may be right — discounts, deposits — so it never blocks).
  const itemsSum = form.items.reduce((sum, it) => {
    const n = parseDecimal(it.total);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
  const totalNumber = parseDecimal(form.amount);
  const itemsMismatch =
    isEdit &&
    form.items.some((it) => it.total.trim()) &&
    Number.isFinite(totalNumber) &&
    Math.abs(itemsSum - totalNumber) > 0.01;

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-4 space-y-3 border-t border-[var(--hairline)]"
      style={isEdit ? undefined : { background: "var(--attention-tint)" }}
      aria-label={isEdit ? t.editTitle : t.completeLabel}
    >
      <p
        className={isEdit ? "text-[var(--ink)]" : "text-[var(--attention-deep)]"}
        style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
      >
        {isEdit ? t.editTitle : t.reviewNeeded}
      </p>
      <p
        className="text-[var(--ink-muted)]"
        style={{ fontSize: "13px", lineHeight: 1.5 }}
      >
        {isEdit ? t.editIntro : t.completeIntro}
      </p>

      <div className="space-y-2">
        <label htmlFor={id("merchant")} className={LABEL_CLASS}>
          {t.merchant}
        </label>
        <Input
          id={id("merchant")}
          // Opening Edit replaces the button that was pressed; start here.
          autoFocus={isEdit}
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
            {t.amount}
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
            {t.date}
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
            {t.currency}
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
            {t.category}
          </label>
          <select
            id={id("category")}
            className={SELECT_CLASS}
            value={form.category}
            onChange={(e) => update("category", e.target.value as CategoryKey)}
          >
            {CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {messages.common.categories[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label htmlFor={id("tax-amount")} className={LABEL_CLASS}>
            {t.vatAmount}
          </label>
          <Input
            id={id("tax-amount")}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={form.taxAmount}
            onChange={(e) => update("taxAmount", e.target.value)}
            className="h-11 font-mono tabular-nums"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={id("tax-rate")} className={LABEL_CLASS}>
            {t.vatRate}
          </label>
          <Input
            id={id("tax-rate")}
            type="number"
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            value={form.taxRate}
            onChange={(e) => update("taxRate", e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={id("payment-method")} className={LABEL_CLASS}>
          {t.paymentMethod}
        </label>
        <Input
          id={id("payment-method")}
          list={id("payment-method-options")}
          className="h-11"
          value={form.paymentMethod}
          onChange={(e) => update("paymentMethod", e.target.value)}
          placeholder={t.paymentPlaceholder}
          maxLength={50}
        />
        <datalist id={id("payment-method-options")}>
          {PAYMENT_METHOD_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>

      {isEdit ? (
        <fieldset className="space-y-2">
          <legend className={LABEL_CLASS}>{t.lineItems}</legend>
          {form.items.length === 0 ? (
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
              {t.noLineItems}
            </p>
          ) : null}
          {form.items.map((it, idx) => (
            <div key={it.key} className="flex items-center gap-2">
              <Input
                aria-label={t.lineDescription(idx + 1)}
                className="h-11 flex-1 min-w-0"
                value={it.label}
                onChange={(e) => updateItem(it.key, { label: e.target.value })}
                maxLength={200}
              />
              <Input
                aria-label={t.lineAmount(idx + 1)}
                type="number"
                step="0.01"
                inputMode="decimal"
                className="h-11 w-28 shrink-0 font-mono tabular-nums"
                value={it.total}
                onChange={(e) => updateItem(it.key, { total: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeItem(it.key)}
                aria-label={t.removeLine(idx + 1)}
                className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-[10px] text-[var(--ink-muted)] hover:bg-[var(--hairline)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {form.items.length < MAX_ITEMS ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-1.5"
              onClick={addItem}
            >
              <Plus className="w-4 h-4" />
              {t.addLine}
            </Button>
          ) : null}
          {itemsMismatch ? (
            <p
              className="text-[var(--ink-muted)]"
              style={{ fontSize: "13px" }}
              data-testid="items-mismatch-hint"
            >
              {t.mismatchBefore}{" "}
              <span className="font-mono tabular-nums">
                {formatAmount(itemsSum, form.currency, locale)}
              </span>
              {t.mismatchMiddle}{" "}
              <span className="font-mono tabular-nums">
                {formatAmount(totalNumber, form.currency, locale)}
              </span>
              {t.mismatchAfter}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {isEdit ? (
        <div className="space-y-2">
          <label htmlFor={id("notes")} className={LABEL_CLASS}>
            {t.notes}
          </label>
          <textarea
            id={id("notes")}
            className="w-full min-h-[60px] rounded-md border bg-card px-3 py-2 text-base md:text-sm"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            maxLength={2000}
          />
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="text-sm bg-[var(--attention-tint)] text-[var(--attention-deep)] rounded-md px-3 py-2"
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
            {messages.common.cancel}
          </Button>
          <Button type="submit" className="flex-1 h-11 gap-1.5" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? messages.common.saving : t.saveChanges}
          </Button>
        </div>
      ) : (
        <Button type="submit" className="w-full h-11 gap-1.5" disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? messages.common.saving : t.completeLabel}
        </Button>
      )}
    </form>
  );
}
