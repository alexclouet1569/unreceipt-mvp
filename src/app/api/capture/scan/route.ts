// POST /api/capture/scan — "Several receipts at once": one photo or one
// scanned page (multipart field `file`) becomes one receipt, read on the
// server. The capture sheet sends a stack one file at a time and splits a
// multi-page PDF into pages in the browser first.
//
// Nobody checks the fields before they are saved, so every receipt made
// here waits in Review needed (src/lib/receipts/scan-fields.ts): filled in
// and marked "To confirm", or "Missing amount" when the model couldn't
// read it. Like other unconfirmed receipts it counts toward the plan only
// once confirmed (PATCH /api/receipts/[id]). A picture that isn't a
// receipt is not saved. A receipt with the same merchant, amount and day
// as one already there is saved with a note, so nobody books it twice.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { hasProductAccess, subscriptionRequiredResponse } from "@/lib/subscription-gate";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateDefaultOrganization } from "@/lib/organizations";
import { homeCurrencyOf } from "@/lib/fx";
import { extractReceipt, type OcrMediaType } from "@/lib/ocr";
import { computeReceiptStatus, missingFieldsText, missingRequiredFields } from "@/lib/receipts/status";
import { looksLikeSameReceipt, scanFields } from "@/lib/receipts/scan-fields";
import { EXTENSION_BY_TYPE, MAX_UPLOAD_BYTES, isAllowedUploadType } from "@/lib/receipts/upload-limits";
import { countPdfPages } from "@/lib/receipts/pdf-pages";
import { usableItems, usableVatLines } from "@/lib/receipts/receipt-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const DUPLICATE_NOTE = "Possible duplicate: another receipt has the same merchant, amount and date.";

export async function POST(request: NextRequest) {
  const formPromise = request.formData().then(
    (form) => ({ form }),
    () => ({ form: null })
  );

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A read and a save in one: both limits count.
  const [access, ocrLimited, captureLimited] = await Promise.all([
    hasProductAccess(user.id),
    rateLimit("ocr", user.id),
    rateLimit("capture", user.id),
  ]);
  if (!access) return subscriptionRequiredResponse();
  if (!ocrLimited.ok) return rateLimitedResponse(ocrLimited.retryAfterSeconds);
  if (!captureLimited.ok) return rateLimitedResponse(captureLimited.retryAfterSeconds);

  const { form } = await formPromise;
  const file = form?.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return NextResponse.json({ error: "Choose a photo or a PDF." }, { status: 400 });
  }
  if (!isAllowedUploadType(file.type)) {
    return NextResponse.json({ error: "Only photos (JPEG, PNG, WebP) and PDFs can be read." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "This file is larger than 4 MB." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  // One receipt per request: the sheet splits a scan into pages first.
  if (file.type === "application/pdf" && countPdfPages(bytes) > 1) {
    return NextResponse.json({ error: "Send one page at a time." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const organizationPromise = getOrCreateDefaultOrganization(user.id);
  organizationPromise.catch(() => {});

  let ocr;
  try {
    ocr = await extractReceipt(bytes.toString("base64"), file.type as OcrMediaType);
  } catch (err) {
    // Not read: kept anyway, waiting for the person to fill it in.
    console.error("[/api/capture/scan] read failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "capture-scan" } });
    ocr = {};
  }

  const organizationId = await organizationPromise;
  const fields = scanFields(ocr, await homeCurrencyOf(organizationId));
  if (!fields) {
    return NextResponse.json({ ok: true, skipped: true, reason: "This doesn't look like a receipt." });
  }

  let duplicate = false;
  if (fields.total != null && fields.receipt_date) {
    const { data: same } = await db
      .from("receipts")
      .select("merchant_name, total, receipt_date")
      .eq("organization_id", organizationId)
      .eq("receipt_date", fields.receipt_date)
      .eq("total", fields.total)
      .limit(20);
    duplicate = (same ?? []).some((r) => looksLikeSameReceipt(fields, r));
  }

  const receiptId = crypto.randomUUID();
  const path = `${user.id}/${receiptId}.${EXTENSION_BY_TYPE[file.type]}`;
  const { error: uploadError } = await db.storage
    .from("receipts")
    .upload(path, bytes, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (uploadError) {
    console.error("[/api/capture/scan] upload failed", uploadError.message);
    return NextResponse.json({ error: "Couldn't store the file. Try again." }, { status: 500 });
  }

  const status = computeReceiptStatus({
    merchant_name: fields.merchant_name,
    purchased_at: fields.purchased_at,
    receipt_date: fields.receipt_date,
    total: fields.total,
    parse_confidence: fields.parse_confidence,
  });
  const vatLines = usableVatLines(fields.vat_lines);

  const { data: inserted, error: insertError } = await db
    .from("receipts")
    .insert({
      id: receiptId,
      user_id: user.id,
      organization_id: organizationId,
      merchant_name: fields.merchant_name,
      category: fields.category,
      currency: fields.currency,
      total: fields.total,
      receipt_date: fields.receipt_date,
      purchased_at: fields.purchased_at,
      tax_amount: fields.tax_amount,
      tax_rate: fields.tax_rate,
      seller_org_number: fields.seller_org_number,
      merchant_vat_number: fields.merchant_vat_number,
      vat_lines: fields.tax_amount != null ? (vatLines ?? null) : null,
      payment_method: fields.payment_method,
      items: usableItems(fields.items) ?? null,
      notes: duplicate ? DUPLICATE_NOTE : null,
      image_url: path,
      image_captured_at: new Date().toISOString(),
      source: "paper",
      status,
      parse_confidence: fields.parse_confidence,
    })
    .select("id, merchant_name, total, currency, receipt_date, purchased_at, status")
    .single();
  if (insertError || !inserted) {
    await db.storage.from("receipts").remove([path]).catch(() => {});
    console.error("[/api/capture/scan] insert failed", insertError?.code);
    return NextResponse.json({ error: "Couldn't save the receipt. Try again." }, { status: 500 });
  }

  const missing = missingRequiredFields(inserted);
  return NextResponse.json({
    ok: true,
    id: inserted.id,
    merchant: inserted.merchant_name,
    total: inserted.total,
    currency: inserted.currency,
    receiptDate: inserted.receipt_date,
    status: inserted.status,
    missing: missing.length > 0 ? missingFieldsText(missing) : null,
    duplicate,
  });
}
