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
import { Camera, Loader2, X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase-client";
import {
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  CURRENCY_OPTIONS,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/receipt-format";

type CaptureDialogProps = {
  userId: string;
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

const fileExt = (name: string) => {
  const i = name.lastIndexOf(".");
  if (i < 0) return "jpg";
  const ext = name.slice(i + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "jpg";
};

export function CaptureDialog({
  userId,
  open,
  onOpenChange,
}: CaptureDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset everything when the dialog closes so the next open is fresh.
  // Critical-gap-style: leftover saveError from a prior attempt would
  // confuse the user on a successful re-open.
  useEffect(() => {
    if (!open) {
      setForm(blankForm());
      setImageFile(null);
      setImagePreview(null);
      setSaving(false);
      setSaveError(null);
    }
  }, [open]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setImageFile(f);
    setImagePreview(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview((ev.target?.result as string) ?? null);
    reader.readAsDataURL(f);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    const supabase = getSupabaseClient();
    let uploadedPath: string | null = null;

    try {
      if (imageFile) {
        const path = `${userId}/${crypto.randomUUID()}.${fileExt(imageFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(path, imageFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: imageFile.type || undefined,
          });
        if (uploadError) {
          // Storage failure: nothing to clean up. Surface the error and bail.
          throw uploadError;
        }
        uploadedPath = path;
      }

      const { error: insertError } = await supabase.from("receipts").insert({
        user_id: userId,
        merchant_name: form.merchant.trim(),
        category: form.category,
        currency: form.currency,
        total: Number(form.amount),
        receipt_date: form.date,
        notes: form.notes.trim() || null,
        image_url: uploadedPath,
        image_captured_at: uploadedPath ? new Date().toISOString() : null,
        source: "captured",
      });

      if (insertError) {
        // CQ2 atomicity: storage upload succeeded, DB insert failed. Best-effort
        // delete the orphan so it doesn't accrue forever. Swallow errors on
        // the cleanup — the visible error is still about the failed save.
        if (uploadedPath) {
          await supabase.storage
            .from("receipts")
            .remove([uploadedPath])
            .catch(() => {});
        }
        throw insertError;
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      // TODO(step-11): Sentry.captureException(err, { tags: { area: "/app save" } });
      console.error("[/app] save failed", err);
      setSaveError("Could not save receipt. Check your connection and try again.");
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
          </div>

          <Field label="Merchant" htmlFor="cd-merchant" required>
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
            <Field label="Amount" htmlFor="cd-amount" required>
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
            <Field label="Currency" htmlFor="cd-currency">
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
            <Field label="Date" htmlFor="cd-date" required>
              <Input
                id="cd-date"
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                required
              />
            </Field>
            <Field label="Category" htmlFor="cd-category">
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
