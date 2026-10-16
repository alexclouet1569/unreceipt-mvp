"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  HEIC_UNSUPPORTED_MESSAGE,
  UNSUPPORTED_FILE_MESSAGE,
  isHeicLike,
  prepareImageForUpload,
} from "@/lib/image-resize";
import {
  MAX_UPLOAD_BYTES,
  isAllowedUploadType,
} from "@/lib/receipts/upload-limits";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  AlertCircle,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Upload,
  X,
} from "lucide-react";
import {
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  CURRENCY_OPTIONS,
  formatAmount,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/receipt-format";
import type { OcrItem, OcrResult } from "@/lib/ocr";
import {
  PAYMENT_METHOD_SUGGESTIONS,
  vatFromGross,
} from "@/lib/receipts/receipt-fields";

type CaptureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after a receipt was saved (before the dialog closes).
  onSaved?: () => void;
};

// Photo first (DESIGN.md "Capture sheet"): pick a photo → we read it →
// the customer checks the result. "review" is also the manual form, for
// a receipt without a photo or a photo we couldn't read.
type Stage = "choose" | "reading" | "review";

const today = () => new Date().toISOString().slice(0, 10);

// The receipt's own currency comes from OCR. Without a photo, guess from
// the phone's language/region: SEK for Sweden, EUR otherwise.
const defaultCurrency = (): CurrencyCode => {
  if (typeof navigator === "undefined") return "EUR";
  return /^sv\b|-SE$/i.test(navigator.language) ? "SEK" : "EUR";
};

// Swedish (25/12/6) and French (20/10/5.5/2.1) rates, then zero. A rate
// OCR reads that isn't listed is added to the menu for that receipt.
const VAT_RATES = ["25", "20", "12", "10", "6", "5.5", "2.1", "0"];

type FormState = {
  merchant: string;
  amount: string;
  currency: CurrencyCode;
  date: string;
  category: CategoryKey;
  taxAmount: string;
  taxRate: string;
  paymentMethod: string;
  notes: string;
};

const blankForm = (): FormState => ({
  merchant: "",
  amount: "",
  currency: defaultCurrency(),
  date: today(),
  category: "other",
  taxAmount: "",
  taxRate: "",
  paymentMethod: "",
  notes: "",
});

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const toNumber = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const UNREADABLE_MESSAGE =
  "We couldn't read this photo. It's still attached, so just fill in the details below.";

export function CaptureDialog({ open, onOpenChange, onSaved }: CaptureDialogProps) {
  const router = useRouter();
  // Two hidden inputs: "Upload" opens the file/gallery picker and "Take
  // photo" opens the camera via `capture="environment"`. One input with
  // `capture` pushed iOS straight to the camera and buried the gallery.
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Bumped whenever the photo is dropped or the sheet closes, so an OCR
  // answer that arrives late can't fill a form it no longer belongs to.
  const ocrRunRef = useRef(0);
  const [stage, setStage] = useState<Stage>("choose");
  const [form, setForm] = useState<FormState>(blankForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Why the photo didn't fill the form (or was refused). Shown as an
  // attention notice so the customer knows to type the fields.
  const [ocrError, setOcrError] = useState<string | null>(null);
  // True once OCR filled the form, so the review says where values came from.
  const [ocrFilled, setOcrFilled] = useState(false);
  // True while the VAT amount is ours (worked out from the rate), so a
  // new total or rate updates it. Typing a VAT amount takes it over.
  const [taxAuto, setTaxAuto] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // Line items extracted by OCR, forwarded to /api/capture so the digital
  // receipt renders the full line breakdown.
  const [items, setItems] = useState<OcrItem[] | null>(null);

  // Reset everything when the sheet closes so the next open is fresh.
  // Adjusted during render (React's "reset state when a prop changes"
  // pattern) rather than in an effect, which would paint stale state once.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setStage("choose");
      setForm(blankForm());
      setImageFile(null);
      setImagePreview(null);
      setSaving(false);
      setSaveError(null);
      setOcrError(null);
      setOcrFilled(false);
      setTaxAuto(false);
      setShowNotes(false);
      setItems(null);
    }
  }

  // An OCR answer for a closed sheet is dropped (see ocrRunRef).
  useEffect(() => {
    if (!open) ocrRunRef.current += 1;
  }, [open]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setAmount = (amount: string) => {
    setForm((prev) => {
      const next = { ...prev, amount };
      const gross = toNumber(amount);
      const rate = toNumber(prev.taxRate);
      if (taxAuto && rate != null) {
        next.taxAmount = gross != null && gross > 0 ? vatFromGross(gross, rate).toFixed(2) : "";
      }
      return next;
    });
  };

  const setTaxRate = (taxRate: string) => {
    const rate = toNumber(taxRate);
    setForm((prev) => {
      const next = { ...prev, taxRate };
      const gross = toNumber(prev.amount);
      if (rate != null && gross != null && gross > 0) {
        next.taxAmount = vatFromGross(gross, rate).toFixed(2);
      }
      return next;
    });
    // "Mixed / other" leaves the amount to the customer.
    setTaxAuto(rate != null);
  };

  const setTaxAmount = (taxAmount: string) => {
    update("taxAmount", taxAmount);
    setTaxAuto(false);
  };

  const runOcr = async (file: File) => {
    const run = ++ocrRunRef.current;
    setStage("reading");
    setOcrError(null);
    setOcrFilled(false);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      if (run !== ocrRunRef.current) return;
      if (!res.ok) {
        // Keep the server's reason (too large, wrong type, missing key…)
        // so the customer — or the founder reading a screenshot — can
        // tell a bad photo from a server problem.
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        const reason = body?.error ?? `HTTP ${res.status}`;
        setOcrError(
          `We couldn't read this photo (${reason}). It's still attached, so just fill in the details below.`
        );
        return;
      }
      const data = (await res.json()) as OcrResult;
      if (run !== ocrRunRef.current) return;
      if (data.not_a_receipt) {
        setOcrError(
          "This doesn't look like a receipt. Try a clearer photo, or fill in the details below."
        );
        return;
      }
      const readSomething =
        typeof data.merchant === "string" || isFiniteNumber(data.amount);
      if (!readSomething) {
        setOcrError(UNREADABLE_MESSAGE);
        return;
      }

      // OCR only fills what the customer hasn't typed; the receipt's
      // currency, date and category win over our defaults.
      setForm((prev) => {
        const next: FormState = { ...prev };
        if (!prev.merchant && typeof data.merchant === "string") {
          next.merchant = data.merchant;
        }
        if (!prev.amount && isFiniteNumber(data.amount)) {
          next.amount = data.amount.toFixed(2);
        }
        if (!prev.taxAmount && isFiniteNumber(data.tax_amount) && data.tax_amount >= 0) {
          next.taxAmount = data.tax_amount.toFixed(2);
        }
        if (
          !prev.taxRate &&
          isFiniteNumber(data.tax_rate) &&
          data.tax_rate >= 0 &&
          data.tax_rate <= 100
        ) {
          next.taxRate = String(data.tax_rate);
        }
        if (
          !prev.paymentMethod &&
          typeof data.payment_method === "string" &&
          data.payment_method.trim()
        ) {
          next.paymentMethod = data.payment_method.trim().slice(0, 50);
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
      // The VAT printed on the receipt beats one we'd work out.
      setTaxAuto(false);
      setOcrFilled(true);
      if (Array.isArray(data.items) && data.items.length > 0) {
        setItems(data.items);
      }
    } catch (err) {
      if (run !== ocrRunRef.current) return;
      console.error("[capture] ocr failed:", err);
      setOcrError(UNREADABLE_MESSAGE);
    } finally {
      if (run === ocrRunRef.current) setStage("review");
    }
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!picked) return;
    setOcrError(null);
    // Shrink phone photos before anything leaves the device (faster on
    // mobile data, cheaper OCR, under the upload cap). PDFs pass through.
    const f = await prepareImageForUpload(picked);
    // Refuse here, with a reason, anything the server would reject anyway
    // (typically an iPhone HEIC photo that this browser can't convert).
    if (!isAllowedUploadType(f.type)) {
      setOcrError(isHeicLike(f) ? HEIC_UNSUPPORTED_MESSAGE : UNSUPPORTED_FILE_MESSAGE);
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setOcrError(
        "This file is larger than 4 MB. Try a photo instead, or forward the PDF to your receipts address."
      );
      return;
    }
    setImageFile(f);
    // PDFs get a document tile instead of an <img> preview; the detail
    // view's Original tab renders the real PDF after save.
    if (f.type === "application/pdf") {
      setImagePreview("__pdf__");
    } else {
      setImagePreview(null);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview((ev.target?.result as string) ?? null);
      reader.readAsDataURL(f);
    }
    void runOcr(f);
  };

  const removeImage = () => {
    ocrRunRef.current += 1;
    setImageFile(null);
    setImagePreview(null);
    setOcrError(null);
    setOcrFilled(false);
    setItems(null);
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
      if (form.taxAmount.trim()) fd.append("tax_amount", form.taxAmount.trim());
      if (form.taxRate.trim()) fd.append("tax_rate", form.taxRate.trim());
      if (form.paymentMethod.trim()) {
        fd.append("payment_method", form.paymentMethod.trim());
      }
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
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          issues?: Array<{ message?: string }>;
        };
        // Validation failures carry a readable reason per field ("VAT
        // can't be more than the total"); show it rather than the generic
        // "validation failed".
        throw new Error(
          body.issues?.[0]?.message ??
            body.error ??
            `Save failed (HTTP ${res.status})`,
        );
      }

      onSaved?.();
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("[/app] save failed:", err);
      setSaveError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  const title =
    stage !== "review"
      ? "New receipt"
      : ocrFilled
        ? "Check and save"
        : imageFile
          ? "Fill in the details"
          : "Enter manually";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto w-full max-w-[540px] gap-0 rounded-t-[16px] bg-card p-0 text-[var(--ink)] shadow-none data-[side=bottom]:h-[min(92dvh,760px)] data-[side=bottom]:border-t-0"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
          {stage === "review" && !imageFile ? (
            <button
              type="button"
              onClick={() => setStage("choose")}
              aria-label="Back"
              className={ICON_BUTTON_CLASS}
            >
              <ChevronLeft className="size-[18px]" aria-hidden="true" />
            </button>
          ) : null}
          <SheetTitle className="flex-1 text-[22px] font-bold tracking-[-0.02em] text-[var(--ink)]">
            {title}
          </SheetTitle>
          <SheetClose aria-label="Close" className={ICON_BUTTON_CLASS}>
            <X className="size-[18px]" aria-hidden="true" />
          </SheetClose>
        </div>

        {stage === "choose" ? (
          <ChooseStage
            notice={ocrError}
            onTakePhoto={() => cameraInputRef.current?.click()}
            onUpload={() => uploadInputRef.current?.click()}
            onManual={() => {
              setOcrError(null);
              setStage("review");
            }}
          />
        ) : null}

        {stage === "reading" ? (
          <ReadingStage imagePreview={imagePreview} file={imageFile} />
        ) : null}

        {stage === "review" ? (
          <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
            <div
              className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-4"
              style={
                ocrFilled
                  ? { animation: "ocr-reveal 480ms cubic-bezier(0.32, 0.72, 0, 1) both" }
                  : undefined
              }
            >
              {ocrError ? <Notice>{ocrError}</Notice> : null}

              <div className={`flex items-end gap-4 ${ocrError ? "mt-4" : ""}`}>
                {imageFile ? (
                  <PhotoThumb
                    imagePreview={imagePreview}
                    file={imageFile}
                    onRemove={removeImage}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <label htmlFor="cd-amount" className={MICRO_LABEL_CLASS}>
                    Total paid
                  </label>
                  <div className="mt-0.5 flex items-center gap-2">
                    <input
                      id="cd-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="h-12 min-w-0 flex-1 appearance-none border-0 border-b border-dashed border-[var(--hairline)] bg-transparent p-0 font-mono text-[40px] leading-none font-medium tracking-[-0.02em] tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--ring)] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="relative shrink-0">
                      <select
                        id="cd-currency"
                        aria-label="Currency"
                        value={form.currency}
                        onChange={(e) => update("currency", e.target.value as CurrencyCode)}
                        className="h-9 appearance-none rounded-full border border-[var(--hairline)] bg-card pr-7 pl-3 text-[16px] font-bold text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {CURRENCY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <VatSummary form={form} />

              <div className="mt-4 overflow-hidden rounded-[12px] border border-[var(--hairline)]">
                <Row label="Merchant" htmlFor="cd-merchant">
                  <input
                    id="cd-merchant"
                    value={form.merchant}
                    onChange={(e) => update("merchant", e.target.value)}
                    placeholder="Shop or company"
                    maxLength={200}
                    required
                    className={ROW_CONTROL_CLASS}
                  />
                </Row>
                <Row label="Date" htmlFor="cd-date">
                  <input
                    id="cd-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => update("date", e.target.value)}
                    required
                    className={ROW_CONTROL_CLASS}
                  />
                </Row>
                <Row label="Category" htmlFor="cd-category">
                  <SelectControl>
                    <select
                      id="cd-category"
                      value={form.category}
                      onChange={(e) => update("category", e.target.value as CategoryKey)}
                      className={`${ROW_CONTROL_CLASS} appearance-none pr-6`}
                    >
                      {CATEGORY_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {CATEGORY_CONFIG[k].label}
                        </option>
                      ))}
                    </select>
                  </SelectControl>
                </Row>
                <Row label="VAT" htmlFor="cd-tax-rate">
                  <SelectControl className="w-[92px] flex-none">
                    <select
                      id="cd-tax-rate"
                      aria-label="VAT rate"
                      value={form.taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className={`${ROW_CONTROL_CLASS} appearance-none pr-6`}
                    >
                      <option value="">Rate</option>
                      {vatRateOptions(form.taxRate).map((r) => (
                        <option key={r} value={r}>
                          {r} %
                        </option>
                      ))}
                    </select>
                  </SelectControl>
                  <input
                    id="cd-tax-amount"
                    aria-label="VAT amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={form.taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${ROW_CONTROL_CLASS} text-right font-mono font-medium tabular-nums [&::-webkit-inner-spin-button]:appearance-none`}
                  />
                </Row>
                <Row label="Payment" htmlFor="cd-payment-method">
                  <input
                    id="cd-payment-method"
                    aria-label="Payment method"
                    list="cd-payment-method-options"
                    value={form.paymentMethod}
                    onChange={(e) => update("paymentMethod", e.target.value)}
                    placeholder="Card, Swish, cash…"
                    maxLength={50}
                    className={ROW_CONTROL_CLASS}
                  />
                  <datalist id="cd-payment-method-options">
                    {PAYMENT_METHOD_SUGGESTIONS.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </Row>
              </div>

              {showNotes || form.notes ? (
                <div className="mt-4">
                  <label htmlFor="cd-notes" className={MICRO_LABEL_CLASS}>
                    Notes
                  </label>
                  <textarea
                    id="cd-notes"
                    className="mt-1.5 min-h-[80px] w-full rounded-[12px] border border-[var(--hairline)] bg-transparent px-4 py-3 text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    placeholder="Who you met, what it was for…"
                    maxLength={2000}
                  />
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1">
                {!showNotes && !form.notes ? (
                  <TextButton onClick={() => setShowNotes(true)}>
                    <Plus className="size-4" aria-hidden="true" />
                    Add a note
                  </TextButton>
                ) : null}
                {!imageFile ? (
                  <>
                    <TextButton onClick={() => cameraInputRef.current?.click()}>
                      <Camera className="size-4" aria-hidden="true" />
                      Take photo
                    </TextButton>
                    <TextButton onClick={() => uploadInputRef.current?.click()}>
                      <Upload className="size-4" aria-hidden="true" />
                      Upload file
                    </TextButton>
                  </>
                ) : null}
              </div>
            </div>

            <div className="border-t border-[var(--hairline)] px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
              {saveError ? (
                <p
                  role="alert"
                  className="mb-3 rounded-[10px] bg-[var(--attention-tint)] px-3 py-2 text-[14px] font-semibold text-[var(--attention-deep)]"
                >
                  {saveError}
                </p>
              ) : ocrFilled ? (
                <p className="mb-2.5 text-center text-[13px] font-medium text-[var(--ink-muted)]">
                  Read from your photo. Tap any value to change it.
                </p>
              ) : null}
              <button
                type="submit"
                disabled={saving}
                className={PRIMARY_BUTTON_CLASS}
              >
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {saving ? "Saving…" : saveError ? "Try again" : "Save receipt"}
              </button>
            </div>
          </form>
        ) : null}

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
      </SheetContent>
    </Sheet>
  );
}

const ICON_BUTTON_CLASS =
  "flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-[var(--hairline)] bg-card text-[var(--ink-muted)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const MICRO_LABEL_CLASS =
  "block text-[11px] font-semibold tracking-[0.06em] text-[var(--ink-muted)] uppercase";

const ROW_CONTROL_CLASS =
  "h-[52px] w-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] font-bold text-[var(--ink)] outline-none placeholder:font-semibold placeholder:text-[var(--ink-faint)]";

const PRIMARY_BUTTON_CLASS =
  "flex h-[54px] w-full items-center justify-center gap-2 rounded-[12px] bg-primary text-[16px] font-bold text-primary-foreground outline-none transition-colors hover:bg-[var(--brand-action-deep)] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

const SECONDARY_BUTTON_CLASS =
  "flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[12px] border border-[var(--hairline)] bg-card text-[16px] font-bold text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function vatRateOptions(current: string): string[] {
  if (!current || VAT_RATES.includes(current)) return VAT_RATES;
  return [...VAT_RATES, current].sort((a, b) => Number(b) - Number(a));
}

function ChooseStage({
  notice,
  onTakePhoto,
  onUpload,
  onManual,
}: {
  notice: string | null;
  onTakePhoto: () => void;
  onUpload: () => void;
  onManual: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
      {notice ? (
        <div className="mb-4">
          <Notice>{notice}</Notice>
        </div>
      ) : null}
      <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center gap-5 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface)] p-6 text-center">
        <Viewfinder />
        <div className="space-y-1.5">
          <p className="text-[18px] font-bold tracking-[-0.01em]">Photograph your receipt</p>
          <p className="mx-auto max-w-[260px] text-[14px] leading-normal font-medium text-[var(--ink-muted)]">
            We read the merchant, total, VAT and date. You check it, then save.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2.5">
        <button type="button" onClick={onTakePhoto} className={PRIMARY_BUTTON_CLASS}>
          <Camera className="size-5" aria-hidden="true" />
          Take photo
        </button>
        <button type="button" onClick={onUpload} className={SECONDARY_BUTTON_CLASS}>
          <Upload className="size-5" aria-hidden="true" />
          Upload photo or PDF
        </button>
        <button
          type="button"
          onClick={onManual}
          className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] text-[15px] font-semibold text-[var(--ink-muted)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          No receipt? Enter it manually
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ReadingStage({
  imagePreview,
  file,
}: {
  imagePreview: string | null;
  file: File | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-[72px] shrink-0 overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-[var(--hairline)]">
          <ThumbContent imagePreview={imagePreview} file={file} />
          <span
            className="absolute inset-x-0 top-[10%] h-0.5 bg-[var(--brand)]"
            style={{ animation: "capture-scan 2.4s cubic-bezier(0.32, 0.72, 0, 1) infinite" }}
            aria-hidden="true"
          />
        </div>
        <div role="status" className="space-y-1">
          <p className="flex items-center gap-2 text-[16px] font-bold">
            <span
              className="inline-block size-2 animate-pulse rounded-full bg-primary"
              aria-hidden="true"
            />
            Reading your receipt…
          </p>
          <p className="text-[13px] font-medium text-[var(--ink-muted)]">
            You can check everything before it&apos;s saved.
          </p>
        </div>
      </div>

      <div className="mt-7 space-y-2.5" aria-hidden="true">
        <Skeleton className="h-[11px] w-[52px]" />
        <Skeleton className="h-10 w-[58%]" />
      </div>
      <div className="mt-5 h-[72px] animate-pulse rounded-[10px] bg-[var(--brand-tint)]" aria-hidden="true" />
      <div
        className="mt-4 overflow-hidden rounded-[12px] border border-[var(--hairline)]"
        aria-hidden="true"
      >
        {[
          ["Merchant", "w-[110px]"],
          ["Date", "w-[90px]"],
          ["Category", "w-[120px]"],
          ["VAT", "w-[100px]"],
          ["Payment", "w-[60px]"],
        ].map(([label, width]) => (
          <div
            key={label}
            className="flex h-[52px] items-center justify-between border-b border-[var(--hairline)] px-4 last:border-b-0"
          >
            <span className="text-[15px] font-semibold text-[var(--ink-muted)]">{label}</span>
            <Skeleton className={`h-3.5 ${width}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[4px] bg-[var(--hairline)] ${className}`} />;
}

function Viewfinder() {
  const corner = "absolute size-[26px] border-[var(--ink)]";
  return (
    <div className="relative flex h-[190px] w-[150px] items-center justify-center" aria-hidden="true">
      <span className={`${corner} top-0 left-0 rounded-tl-[8px] border-t-2 border-l-2`} />
      <span className={`${corner} top-0 right-0 rounded-tr-[8px] border-t-2 border-r-2`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-[8px] border-b-2 border-l-2`} />
      <span className={`${corner} right-0 bottom-0 rounded-br-[8px] border-r-2 border-b-2`} />
      <div className="flex h-[140px] w-24 flex-col gap-[7px] rounded-[4px] border border-[var(--hairline)] bg-card px-3 py-3.5">
        <span className="h-1.5 w-[60%] self-center rounded-full bg-[var(--ink)] opacity-80" />
        <span className="mt-1.5 h-1 w-full rounded-full bg-[var(--hairline)]" />
        <span className="h-1 w-[85%] rounded-full bg-[var(--hairline)]" />
        <span className="h-1 w-[92%] rounded-full bg-[var(--hairline)]" />
        <span className="h-1 w-[70%] rounded-full bg-[var(--hairline)]" />
        <span className="mt-1 border-t border-dashed border-[var(--hairline)]" />
        <span className="flex justify-between">
          <span className="h-1.5 w-[30%] rounded-full bg-[var(--ink)] opacity-80" />
          <span className="h-1.5 w-[34%] rounded-full bg-[var(--ink)] opacity-80" />
        </span>
      </div>
    </div>
  );
}

function ThumbContent({
  imagePreview,
  file,
}: {
  imagePreview: string | null;
  file: File | null;
}) {
  if (imagePreview === "__pdf__") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-card text-[var(--ink-muted)]">
        <FileText className="size-6" aria-hidden="true" />
        <span className="text-[10px] font-bold uppercase">PDF</span>
      </div>
    );
  }
  if (imagePreview) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={imagePreview}
        alt={file ? `Receipt photo ${file.name}` : "Receipt preview"}
        className="h-full w-full object-cover"
      />
    );
  }
  return null;
}

function PhotoThumb({
  imagePreview,
  file,
  onRemove,
}: {
  imagePreview: string | null;
  file: File;
  onRemove: () => void;
}) {
  return (
    <div className="relative shrink-0">
      <div className="h-[84px] w-16 overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-[var(--hairline)]">
        <ThumbContent imagePreview={imagePreview} file={file} />
      </div>
      {/* 44px tap target around a small visual badge. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="absolute -top-4 -right-4 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-6 items-center justify-center rounded-full border border-[var(--hairline)] bg-card text-[var(--ink-muted)]">
          <X className="size-3.5" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

function VatSummary({ form }: { form: FormState }) {
  const gross = toNumber(form.amount);
  const vat = toNumber(form.taxAmount);
  if (gross == null || gross <= 0 || vat == null || vat <= 0 || vat > gross) return null;
  const rate = toNumber(form.taxRate);
  return (
    <div className="mt-4 space-y-1.5 rounded-[10px] border border-[color-mix(in_srgb,var(--brand)_20%,transparent)] bg-[var(--brand-tint)] px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-semibold">
          {rate != null ? `VAT ${form.taxRate} %` : "VAT"}
        </span>
        <span className="font-mono text-[15px] font-medium tabular-nums">
          {formatAmount(vat, form.currency)}
        </span>
      </div>
      <div className="flex items-baseline justify-between text-[var(--ink-muted)]">
        <span className="text-[14px] font-semibold">Excl. VAT</span>
        <span className="font-mono text-[15px] font-medium tabular-nums">
          {formatAmount(Math.round((gross - vat) * 100) / 100, form.currency)}
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 border-b border-[var(--hairline)] px-4 outline-[var(--ring)] -outline-offset-2 last:border-b-0 focus-within:bg-[var(--surface)] focus-within:outline-2">
      <label
        htmlFor={htmlFor}
        className="w-[84px] shrink-0 text-[15px] font-semibold text-[var(--ink-muted)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SelectControl({
  children,
  className = "flex-1",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative flex min-w-0 items-center ${className}`}>
      {children}
      <ChevronDown
        className="pointer-events-none absolute right-0 size-4 text-[var(--ink-muted)]"
        aria-hidden="true"
      />
    </div>
  );
}

function TextButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center gap-2 rounded-[10px] px-1 text-[15px] font-semibold text-[var(--ink-muted)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </button>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-[10px] bg-[var(--attention-tint)] px-3.5 py-3 text-[14px] leading-snug font-semibold text-[var(--attention-deep)]"
    >
      <AlertCircle className="mt-px size-[18px] shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
