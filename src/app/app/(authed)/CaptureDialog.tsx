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
import { Camera, FileText, Loader2, Upload, X } from "lucide-react";
import {
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  CURRENCY_OPTIONS,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/receipt-format";
import type { OcrItem, OcrResult } from "@/lib/ocr";

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

export function CaptureDialog({ open, onOpenChange }: CaptureDialogProps) {
  const router = useRouter();
  // Two hidden inputs so the picker UI is explicit: "Upload" opens the
  // file/gallery picker (no camera bias) and "Take photo" opens the camera
  // via `capture="environment"`. The old single-input + `capture` attr
  // pushed iOS straight to the camera and buried the gallery path.
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  // Surface OCR failures to the user instead of silently bailing. Without
  // this the form stays blank and the customer can't tell whether OCR
  // ran, mis-identified the photo, or actually crashed server-side.
  const [ocrError, setOcrError] = useState<string | null>(null);
  // Line items extracted by OCR (or pre-set later via the edit flow).
  // Forwarded to /api/capture so the digital receipt renders the full
  // line breakdown.
  const [items, setItems] = useState<OcrItem[] | null>(null);

  // Reset everything when the dialog closes so the next open is fresh.
  useEffect(() => {
    if (!open) {
      setForm(blankForm());
      setImageFile(null);
      setImagePreview(null);
      setSaving(false);
      setSaveError(null);
      setOcrLoading(false);
      setOcrError(null);
      setItems(null);
    }
  }, [open]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const runOcr = async (file: File) => {
    setOcrLoading(true);
    setOcrError(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      if (!res.ok) {
        // Try to surface the server-side error message so the customer
        // (or the dev reading the screen) knows whether the image was
        // too big, the API key is missing, etc. Common cases:
        //   413/400 — image too large or wrong type
        //   500    — Claude call threw (missing key, network)
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        const reason = body?.error ?? `HTTP ${res.status}`;
        setOcrError(
          `Auto-fill failed: ${reason}. You can still type the fields manually.`
        );
        return;
      }
      const data = (await res.json()) as OcrResult;
      if (data.not_a_receipt) {
        setOcrError(
          "We couldn't recognise this image as a receipt. Try a clearer photo, or type the fields below."
        );
        return;
      }

      setForm((prev) => {
        const next: FormState = { ...prev };
        if (!prev.merchant && typeof data.merchant === "string") {
          next.merchant = data.merchant;
        }
        if (!prev.amount && typeof data.amount === "number" && Number.isFinite(data.amount)) {
          next.amount = String(data.amount);
        }
        if (
          typeof data.currency === "string" &&
          (CURRENCY_OPTIONS as readonly string[]).includes(data.currency)
        ) {
          next.currency = data.currency as CurrencyCode;
        }
        if (
          typeof data.receipt_date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(data.receipt_date)
        ) {
          next.date = data.receipt_date;
        }
        if (
          typeof data.category === "string" &&
          (CATEGORY_KEYS as readonly string[]).includes(data.category)
        ) {
          next.category = data.category as CategoryKey;
        }
        return next;
      });
      if (Array.isArray(data.items) && data.items.length > 0) {
        setItems(data.items);
      }
    } catch (err) {
      console.error("[capture] ocr failed:", err);
      setOcrError(
        err instanceof Error
          ? `Auto-fill failed: ${err.message}. Type the fields manually.`
          : "Auto-fill failed. Type the fields manually."
      );
    } finally {
      setOcrLoading(false);
    }
  };

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setImageFile(f);
    setImagePreview(null);
    if (!f) return;
    // PDFs can't be previewed with FileReader as a data URL inside an <img>
    // — show a generic document badge instead. The Original tab on the
    // detail dialog (PR #52) renders the real PDF after save.
    if (f.type === "application/pdf") {
      setImagePreview("__pdf__");
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview((ev.target?.result as string) ?? null);
      reader.readAsDataURL(f);
    }
    void runOcr(f);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setOcrLoading(false);
    setOcrError(null);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
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
      if (items && items.length > 0) {
        fd.append("items", JSON.stringify(items));
      }

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
                {imagePreview === "__pdf__" && imageFile ? (
                  <div className="w-full rounded-lg border bg-[var(--brand-tint,#ECF7E7)]/30 p-6 flex items-center gap-3">
                    <FileText className="w-8 h-8 text-[var(--ink-muted)] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-[var(--ink)] truncate">
                        {imageFile.name}
                      </p>
                      <p className="text-[12px] text-[var(--ink-muted)]">
                        PDF · {(imageFile.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imagePreview}
                    alt="Receipt preview"
                    className="w-full rounded-lg border"
                  />
                )}
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-background/80 backdrop-blur rounded-full p-1 border border-border"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                className="w-full border border-dashed border-[var(--hairline)] rounded-[12px] p-5 text-center"
                style={{
                  backgroundImage:
                    "radial-gradient(circle 1px at 1px 1px, color-mix(in srgb, var(--ink) 6%, transparent) 1px, transparent 1.5px)",
                  backgroundSize: "8px 8px",
                }}
              >
                <p className="text-[14px] font-medium text-[var(--ink)] mb-1">
                  Add a receipt (optional)
                </p>
                <p className="text-[12px] text-[var(--ink-muted)] mb-3">
                  Photo, PDF, or screenshot
                </p>
                <div className="flex gap-2 justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => uploadInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <Upload className="w-4 h-4" />
                    Upload
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => cameraInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <Camera className="w-4 h-4" />
                    Take photo
                  </Button>
                </div>
              </div>
            )}
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={onPickFile}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPickFile}
            />
            {ocrLoading ? (
              <p
                role="status"
                className="mt-3 flex items-center gap-2 text-[13px] text-[var(--ink-muted)]"
              >
                <span
                  className="inline-block rounded-full animate-pulse"
                  style={{ width: "8px", height: "8px", background: "var(--primary)" }}
                  aria-hidden="true"
                />
                Reading your receipt…
              </p>
            ) : null}
            {!ocrLoading && ocrError ? (
              <p
                role="alert"
                className="mt-3 text-[13px] text-destructive bg-destructive/10 rounded-md px-3 py-2"
              >
                {ocrError}
              </p>
            ) : null}
          </div>

          {ocrLoading ? (
            <OcrSkeletons />
          ) : (
            <div
              key="ocr-fields"
              style={{
                animation: "ocr-reveal 480ms cubic-bezier(0.32, 0.72, 0, 1) both",
              }}
              className="space-y-3"
            >
          <Field
            label="Merchant"
            htmlFor="cd-merchant"
            required
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
                className="font-mono tabular-nums"
              />
            </Field>
            <Field
              label="Currency"
              htmlFor="cd-currency"
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

          </div>
          )}

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

          <Button type="submit" className="w-full gap-1.5" disabled={saving || ocrLoading}>
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
        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]"
      >
        <span>
          {label}
          {required ? <span className="text-destructive ml-0.5">*</span> : null}
        </span>
      </label>
      {children}
    </div>
  );
}


function OcrSkeletons() {
  // Five varied-width skeleton bars per DESIGN.md — collective reveal happens
  // when ocrLoading flips false and the real fields mount in their place.
  const widths = ["65%", "35%", "50%", "40%", "30%"];
  return (
    <div className="space-y-3" aria-hidden="true">
      {widths.map((w, i) => (
        <div
          key={i}
          className="rounded-[6px] bg-[var(--hairline)] animate-pulse"
          style={{ height: "36px", width: w }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
