"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  CURRENCY_OPTIONS,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/receipt-format";

type PasteFormProps = {
  userId: string;
};

const today = () => new Date().toISOString().slice(0, 10);

type FormState = {
  merchant: string;
  amount: string;
  currency: CurrencyCode;
  date: string;
  category: CategoryKey;
  tax_amount: string;
  tax_rate: string;
  payment_method: string;
  receipt_number: string;
  notes: string;
};

const blankForm = (): FormState => ({
  merchant: "",
  amount: "",
  currency: "EUR",
  date: today(),
  category: "other",
  tax_amount: "",
  tax_rate: "",
  payment_method: "",
  receipt_number: "",
  notes: "",
});

export function PasteForm({ userId }: PasteFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(blankForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    setSubmitting(true);

    try {
      const body = {
        user_id: userId,
        merchant: form.merchant.trim(),
        amount: Number(form.amount),
        currency: form.currency,
        date: form.date,
        category: form.category,
        tax_amount: form.tax_amount ? Number(form.tax_amount) : undefined,
        tax_rate: form.tax_rate ? Number(form.tax_rate) : undefined,
        payment_method: form.payment_method.trim() || undefined,
        receipt_number: form.receipt_number.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };

      const res = await fetch("/api/admin/receipts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error ?? `Save failed (${res.status})`);
        setSubmitting(false);
        return;
      }

      // Keep the date so the founder can batch same-day receipts without
      // re-typing it. Reset everything else for the next paste.
      const keepDate = form.date;
      setForm({ ...blankForm(), date: keepDate });
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="py-5 px-5 space-y-4">
        <div>
          <h2 className="font-semibold text-base">Paste receipt</h2>
          <p className="text-xs text-muted-foreground">
            Inserts as <span className="font-mono">source=forwarded</span>.
            Tab through the fields — Cmd+Enter saves.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <FieldRow label="Merchant" htmlFor="merchant" required>
            <Input
              id="merchant"
              value={form.merchant}
              onChange={(e) => update("merchant", e.target.value)}
              placeholder="Stripe"
              maxLength={200}
              required
              autoFocus
            />
          </FieldRow>

          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Amount" htmlFor="amount" required>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                placeholder="49.00"
                required
              />
            </FieldRow>
            <FieldRow label="Currency" htmlFor="currency">
              <select
                id="currency"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={form.currency}
                onChange={(e) =>
                  update("currency", e.target.value as CurrencyCode)
                }
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FieldRow>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Date" htmlFor="date" required>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                required
              />
            </FieldRow>
            <FieldRow label="Category" htmlFor="category">
              <select
                id="category"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={form.category}
                onChange={(e) =>
                  update("category", e.target.value as CategoryKey)
                }
              >
                {CATEGORY_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_CONFIG[k].label}
                  </option>
                ))}
              </select>
            </FieldRow>
          </div>

          <FieldRow label="Notes" htmlFor="notes">
            <textarea
              id="notes"
              className="w-full min-h-[60px] rounded-md border bg-transparent px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Forwarding email subject, anything useful…"
              maxLength={2000}
            />
          </FieldRow>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            More fields
          </button>

          {expanded ? (
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Tax amount" htmlFor="tax_amount">
                <Input
                  id="tax_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={form.tax_amount}
                  onChange={(e) => update("tax_amount", e.target.value)}
                  placeholder="0.00"
                />
              </FieldRow>
              <FieldRow label="Tax rate %" htmlFor="tax_rate">
                <Input
                  id="tax_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  inputMode="decimal"
                  value={form.tax_rate}
                  onChange={(e) => update("tax_rate", e.target.value)}
                  placeholder="20"
                />
              </FieldRow>
              <FieldRow label="Payment method" htmlFor="payment_method">
                <Input
                  id="payment_method"
                  value={form.payment_method}
                  onChange={(e) => update("payment_method", e.target.value)}
                  placeholder="Visa •••• 4242"
                  maxLength={100}
                />
              </FieldRow>
              <FieldRow label="Receipt number" htmlFor="receipt_number">
                <Input
                  id="receipt_number"
                  value={form.receipt_number}
                  onChange={(e) => update("receipt_number", e.target.value)}
                  placeholder="INV-12345"
                  maxLength={100}
                />
              </FieldRow>
            </div>
          ) : null}

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" className="gap-1.5" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? "Saving…" : "Save receipt"}
            </Button>
            {savedAt ? (
              <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved
              </span>
            ) : null}
            {error ? (
              <span className="text-xs text-destructive">{error}</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldRow({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  );
}
