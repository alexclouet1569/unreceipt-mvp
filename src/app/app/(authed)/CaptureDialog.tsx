"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Camera, Loader2, Sparkles, X } from "lucide-react";
import {
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  CURRENCY_OPTIONS,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/receipt-format";
import type { OcrResult } from "@/lib/ocr";

type CaptureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const today = () => new Date().toISOString().slice(0, 10);

type FormState = {
  merchant: string;
  amount: string;
  currency: CurrencyCode;
  date: string;
  category: CategoryKey;
  notes: string;
};

const blankForm = (): FormState => ({
  merchant: "",
  amount: "",
  currency: "EUR",
  date: today(),
  category: "other",
  notes: "",
});

type OcrFilledFields = Partial<Record<keyof FormState, true>>;

export function CaptureDialog({ open, onOpenChange }: CaptureDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrFilled, setOcrFilled] = useState<OcrFilledFields>({});

  // Reset everything when the dialog closes so the next open is fresh.
  useEffect(() => {
    if (!open) {
      setForm(blankForm());
      setImageFile(null);
      setImagePreview(null);
      setSaving(false);
      setSaveError(null);
      setOcrLoading(false);
      setOcrFilled({});
    }
  }, [open]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // User typing into a field overrides the "auto-filled" badge.
    setOcrFilled((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const runOcr = async (file: File) => {
    setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      if (!res.ok) return;
      const data = (await res.json()) as OcrResult;
      if (data.not_a_receipt) return;

      const filled: OcrFilledFields = {};
      setForm((prev) => {
        const next: FormState = { ...prev };
        if (!prev.merchant && typeof data.merchant === "string") {
          next.merchant = data.merchant;
          filled.merchant = true;
        }
        if (!prev.amount && typeof data.amount === "number" && Number.isFinite(data.amount)) {
          next.amount = String(data.amount);
          filled.amount = true;
        }
        if (
          typeof data.currency === "string" &&
          (CURRENCY_OPTIONS as readonly string[]).includes(data.currency)
        ) {
          next.currency = data.currency as CurrencyCode;
          filled.currency = true;
        }
        if (
          typeof data.receipt_date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(data.receipt_date)
        ) {
          next.date = data.receipt_date;
          filled.date = true;
        }
        if (
          typeof data.category === "string" &&
          (CATEGORY_KEYS as readonly string[]).includes(data.category)
        ) {
          next.category = data.category as CategoryKey;
          filled.category = true;
        }
        return next;
      });
      setOcrFilled(filled);
    } catch (err) {
      console.error("[capture] ocr failed:", err);
      // silent fallback — user can still type fields manually
    } finally {
      setOcrLoading(false);
    }
  };

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setImageFile(f);
    setImagePreview(null);
    setOcrFilled({});
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview((ev.target?.result as string) ?? null);
    reader.readAsDataURL(f);
    void runOcr(f);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setOcrFilled({});
    setOcrLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    try {
      const fd = new FormData();
      fd.append("merchant", form.merchant.trim());
      fd.append("amount", String(form.amount));
      fd.append("currency", form.currency);
      fd.append("receipt_date", form.date);
      fd.append("category", form.category);
      if (form.notes.trim()) fd.append("notes", form.notes.trim());
      if (imageFile) fd.append("image", imageFile);

      const res = await fetch("/api/capture", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (HTTP ${res.status})`);
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("[/app] save failed:", err);
      setSaveError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Capture receipt</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            {imagePreview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Receipt preview"
                  className="w-full rounded-lg border"
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-background/80 backdrop-blur rounded-full p-1 border border-border"
                  aria-label="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <Camera className="w-7 h-7 text-muted-foreground mx-auto mb-1" />
                <p className="text-sm font-medium">Add a photo (optional)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tap to take or choose
                </p>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPickFile}
            />
            {ocrLoading ? (
              <p
                role="status"
                className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                Reading your receipt…
              </p>
            ) : Object.keys(ocrFilled).length > 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <Sparkles className="h-3.5 w-3.5" />
                Auto-filled — review and save
              </p>
            ) : null}
          </div>

          <Field
            label="Merchant"
            htmlFor="cd-merchant"
            required
            autoFilled={ocrFilled.merchant}
          >
            <Input
              id="cd-merchant"
              value={form.merchant}
              onChange={(e) => update("merchant", e.target.value)}
              placeholder="ICA Maxi"
              maxLength={200}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Amount"
              htmlFor="cd-amount"
              required
              autoFilled={ocrFilled.amount}
            >
              <Input
                id="cd-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                placeholder="49.00"
                required
              />
            </Field>
            <Field
              label="Currency"
              htmlFor="cd-currency"
              autoFilled={ocrFilled.currency}
            >
              <select
                id="cd-currency"
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
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Date"
              htmlFor="cd-date"
              required
              autoFilled={ocrFilled.date}
            >
              <Input
                id="cd-date"
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                required
              />
            </Field>
            <Field
              label="Category"
              htmlFor="cd-category"
              autoFilled={ocrFilled.category}
            >
              <select
                id="cd-category"
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
            </Field>
          </div>

          <Field label="Notes" htmlFor="cd-notes">
            <textarea
              id="cd-notes"
              className="w-full min-h-[60px] rounded-md border bg-transparent px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Anything useful…"
              maxLength={2000}
            />
          </Field>

          {saveError ? (
            <p
              role="alert"
              className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
            >
              {saveError}
            </p>
          ) : null}

          <Button type="submit" className="w-full gap-1.5" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? "Saving…" : saveError ? "Try again" : "Save receipt"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  required,
  autoFilled,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  autoFilled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
      >
        <span>
          {label}
          {required ? <span className="text-destructive ml-0.5">*</span> : null}
        </span>
        {autoFilled ? (
          <Sparkles
            className="h-3 w-3 text-emerald-600"
            aria-label="Auto-filled"
          />
        ) : null}
      </label>
      {children}
    </div>
  );
}
