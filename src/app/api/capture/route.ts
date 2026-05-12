import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CaptureSchema = z.object({
  merchant: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(1_000_000),
  currency: z.enum(CURRENCY_OPTIONS),
  receipt_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "receipt_date must be YYYY-MM-DD"),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]),
  notes: z.string().max(2000).optional(),
});

const fileExt = (name: string): string => {
  const i = name.lastIndexOf(".");
  if (i < 0) return "jpg";
  const ext = name.slice(i + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "jpg";
};

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const amountRaw = form.get("amount");
  const notesRaw = form.get("notes");
  const parsed = CaptureSchema.safeParse({
    merchant: typeof form.get("merchant") === "string" ? form.get("merchant") : undefined,
    amount: typeof amountRaw === "string" && amountRaw !== "" ? Number(amountRaw) : NaN,
    currency: typeof form.get("currency") === "string" ? form.get("currency") : undefined,
    receipt_date:
      typeof form.get("receipt_date") === "string" ? form.get("receipt_date") : undefined,
    category: typeof form.get("category") === "string" ? form.get("category") : undefined,
    notes: typeof notesRaw === "string" && notesRaw.length > 0 ? notesRaw : undefined,
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
    const filename = "name" in image && typeof image.name === "string" ? image.name : "upload";
    const path = `${user.id}/${crypto.randomUUID()}.${fileExt(filename)}`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, image as Blob, {
        cacheControl: "3600",
        upsert: false,
        contentType: image.type || undefined,
      });
    if (uploadError) {
      console.error("[/api/capture] upload failed:", uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message ?? "unknown"}` },
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
      source,
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
      { error: `Save failed: ${insertError?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
