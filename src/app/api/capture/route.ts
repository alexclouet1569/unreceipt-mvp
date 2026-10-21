import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/supabase-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import {
  hasProductAccess,
  subscriptionRequiredResponse,
} from "@/lib/subscription-gate";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";
import { computeReceiptStatus } from "@/lib/receipts/status";
import { recordReceiptUsage } from "@/lib/usage";
import {
  MAX_AMOUNT,
  PaymentMethodSchema,
  TaxAmountSchema,
  TaxRateSchema,
  optionalNumber,
  optionalString,
  taxExceedsTotal,
  usableItems,
} from "@/lib/receipts/receipt-fields";
import {
  EXTENSION_BY_TYPE,
  MAX_UPLOAD_BYTES,
  isAllowedUploadType,
} from "@/lib/receipts/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CaptureSchema = z
  .object({
    merchant: z
      .string({ error: "Enter the merchant" })
      .trim()
      .min(1, "Enter the merchant")
      .max(200, "The merchant name can be at most 200 characters"),
    amount: z
      .number({ error: "Enter the total paid" })
      .positive("Enter a total greater than 0")
      .max(MAX_AMOUNT, "The total is too large"),
    currency: z.enum(CURRENCY_OPTIONS, { error: "Choose a currency" }),
    receipt_date: z
      .string({ error: "Enter the date" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date"),
    category: z.enum(CATEGORY_KEYS as [string, ...string[]], { error: "Choose a category" }),
    notes: z.string().max(2000, "The note can be at most 2,000 characters").optional(),
    // VAT and payment method, pre-filled by OCR and editable in the form.
    // All optional: plenty of receipts (foreign, VAT-exempt) show none.
    tax_amount: TaxAmountSchema.optional(),
    tax_rate: TaxRateSchema.optional(),
    payment_method: PaymentMethodSchema.optional(),
    // Read off the photo by OCR, for expense claims (town).
    merchant_address: z
      .string()
      .trim()
      .max(300, "The address can be at most 300 characters")
      .optional(),
  })
  .refine((d) => !taxExceedsTotal(d.tax_amount, d.amount), {
    message: "VAT can't be more than the total",
    path: ["tax_amount"],
  });


export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!(await hasProductAccess(user.id))) {
    return subscriptionRequiredResponse();
  }

  const limited = await rateLimit("capture", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const amountRaw = form.get("amount");
  const notesRaw = form.get("notes");
  // Items arrive as a single JSON-encoded string from the client (the
  // form is multipart so we can't send a nested array natively).
  const itemsRaw = form.get("items");
  let itemsJson: unknown = undefined;
  if (typeof itemsRaw === "string" && itemsRaw.length > 0) {
    try {
      itemsJson = JSON.parse(itemsRaw);
    } catch {
      return NextResponse.json(
        { error: "items must be a JSON array" },
        { status: 400 }
      );
    }
  }
  const parsed = CaptureSchema.safeParse({
    merchant: typeof form.get("merchant") === "string" ? form.get("merchant") : undefined,
    amount: typeof amountRaw === "string" && amountRaw !== "" ? Number(amountRaw) : NaN,
    currency: typeof form.get("currency") === "string" ? form.get("currency") : undefined,
    receipt_date:
      typeof form.get("receipt_date") === "string" ? form.get("receipt_date") : undefined,
    category: typeof form.get("category") === "string" ? form.get("category") : undefined,
    notes: typeof notesRaw === "string" && notesRaw.length > 0 ? notesRaw : undefined,
    tax_amount: optionalNumber(form.get("tax_amount")),
    tax_rate: optionalNumber(form.get("tax_rate")),
    payment_method: optionalString(form.get("payment_method")),
    merchant_address: optionalString(form.get("merchant_address")),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const data = parsed.data;
  // Purchase time read by OCR (expense claims tell lunch from dinner by
  // it). Like OCR line items, an unusable value is dropped, never a reason
  // to refuse the save.
  const timeRaw = optionalString(form.get("receipt_time"));
  const receiptTime = timeRaw && /^([01]?\d|2[0-3]):[0-5]\d$/.test(timeRaw) ? timeRaw : null;
  // Line items extracted by OCR on the client. Optional — manual entries
  // skip this, supermarket scans include the full list. Lines that don't
  // validate are dropped instead of failing the save.
  const items = usableItems(itemsJson);
  const supabase = getSupabaseAdmin();

  let uploadedPath: string | null = null;
  const image = form.get("image");
  // FormDataEntryValue is `string | File`; everything non-string is a file
  // entry (Blob with optional filename). Avoid `instanceof File` because
  // the global File can differ across runtimes (jsdom vs undici in tests).
  if (image && typeof image !== "string" && image.size > 0) {
    // Same allowlist and cap as /api/ocr. The extension comes from the
    // checked MIME type, never from the client's filename.
    if (!isAllowedUploadType(image.type)) {
      return NextResponse.json(
        { error: "unsupported file type" },
        { status: 400 }
      );
    }
    if (image.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "file too large (max 4 MB)" },
        { status: 400 }
      );
    }
    const path = `${user.id}/${crypto.randomUUID()}.${EXTENSION_BY_TYPE[image.type]}`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, image as Blob, {
        cacheControl: "3600",
        upsert: false,
        contentType: image.type,
      });
    if (uploadError) {
      console.error("[/api/capture] upload failed:", uploadError);
      return NextResponse.json(
        { error: "Couldn't store the file. Please try again." },
        { status: 500 }
      );
    }
    uploadedPath = path;
  }

  // `purchased_at` is the canonical purchase timestamp introduced in step 3.
  // The form only collects YYYY-MM-DD, so we pin to noon UTC of that date —
  // close enough to "mid-day on the receipt day" regardless of the user's
  // timezone, and keeps the new inbox sort (purchased_at DESC) stable even
  // when several receipts share the same calendar day.
  const purchasedAt = `${data.receipt_date}T12:00:00.000Z`;

  // Source discriminator: `paper` when a photo was attached (with or
  // without OCR), `manual` when the user filled the form blank. Email
  // and SMS intake paths land here too in steps 6–7 with their own values.
  const source = uploadedPath ? "paper" : "manual";

  const status = computeReceiptStatus({
    merchant_name: data.merchant.trim(),
    purchased_at: purchasedAt,
    total: data.amount,
    // No parse confidence — manual entry is user-attested. Don't penalise.
    parse_confidence: null,
  });

  const { data: inserted, error: insertError } = await supabase
    .from("receipts")
    .insert({
      user_id: user.id,
      merchant_name: data.merchant.trim(),
      category: data.category,
      currency: data.currency,
      total: data.amount,
      receipt_date: data.receipt_date,
      purchased_at: purchasedAt,
      notes: data.notes?.trim() || null,
      tax_amount: data.tax_amount ?? null,
      tax_rate: data.tax_rate ?? null,
      payment_method: data.payment_method ?? null,
      receipt_time: receiptTime,
      merchant_address: data.merchant_address || null,
      image_url: uploadedPath,
      image_captured_at: uploadedPath ? new Date().toISOString() : null,
      items: items ?? null,
      source,
      status,
    })
    // The whole row, so the capture sheet can show the digital receipt
    // straight away. It's the row just inserted for this user, so nothing
    // leaves that the dashboard wouldn't show them anyway.
    .select("*")
    .single();

  if (insertError || !inserted) {
    // Atomicity: if storage succeeded but DB failed, best-effort delete
    // the orphan so it doesn't accrue forever.
    if (uploadedPath) {
      await supabase.storage
        .from("receipts")
        .remove([uploadedPath])
        .catch(() => {});
    }
    console.error("[/api/capture] insert failed:", insertError);
    return NextResponse.json(
      { error: "Couldn't save the receipt. Please try again." },
      { status: 500 }
    );
  }

  await recordReceiptUsage({
    userId: user.id,
    receiptId: inserted.id,
    source,
  });

  return NextResponse.json({ ok: true, id: inserted.id, receipt: inserted });
}
