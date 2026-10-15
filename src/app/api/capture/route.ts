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
  EXTENSION_BY_TYPE,
  MAX_UPLOAD_BYTES,
  isAllowedUploadType,
} from "@/lib/receipts/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ItemSchema = z.object({
  label: z.string().min(1).max(200),
  qty: z.number().positive().max(10_000).nullable().optional(),
  unit_amount: z.number().nonnegative().max(1_000_000).nullable().optional(),
  total_amount: z.number().nonnegative().max(1_000_000),
});

const CaptureSchema = z.object({
  merchant: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(1_000_000),
  currency: z.enum(CURRENCY_OPTIONS),
  receipt_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "receipt_date must be YYYY-MM-DD"),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]),
  notes: z.string().max(2000).optional(),
  // Line items extracted by OCR on the client. Optional — manual
  // entries skip this, supermarket scans include the full list.
  items: z.array(ItemSchema).max(200).optional(),
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
    items: itemsJson,
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
      image_url: uploadedPath,
      image_captured_at: uploadedPath ? new Date().toISOString() : null,
      items: data.items && data.items.length > 0 ? data.items : null,
      source,
      status,
    })
    .select("id")
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

  return NextResponse.json({ ok: true, id: inserted.id });
}
