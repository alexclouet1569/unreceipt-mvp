// POST /api/capture/scan — "Several receipts at once": one photo or one
// scanned page (multipart field `file`) becomes one receipt, read on the
// server. The capture sheet sends a stack one file at a time.
//
// A multi-page PDF arrives either
//   * split: the whole file was stored first (/api/capture/scan/original),
//     each page comes here as a one-page PDF with `scan` (that stored
//     path), `page` and `pages`; the receipt's original is the whole scan,
//     and a page that isn't a receipt is not saved (it stays in the scan);
//   * whole (`whole=1`): one receipt for the document, up to MAX_PDF_PAGES,
//     stored as it is (encrypted PDFs and e-invoices with embedded files
//     are always sent this way, src/lib/receipts/pdf-inspect.ts).
//
// Nobody checks the fields before they are saved, so every receipt made
// here waits in Review needed (src/lib/receipts/scan-fields.ts): filled in
// and marked "To confirm", or "Missing amount" when the model couldn't
// read it. Like other unconfirmed receipts it counts toward the plan only
// once confirmed (PATCH /api/receipts/[id]). A picture that isn't a
// receipt is not saved. A receipt with the same merchant, amount and day
// as one already there is saved with a note, so nobody books it twice.
//
// The iPhone app and the web batch send each file's own id as `client_id` (a UUID). The app
// sends a scan again when the answer was lost (bad connection, app closed),
// so a scan already saved is answered with its receipt: no second reading,
// no second receipt. The unique (user_id, client_upload_id) index settles
// two copies arriving together.

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
import { MAX_PDF_PAGES, pdfPageCount } from "@/lib/receipts/pdf-pages";
import { isOwnScanPath, MAX_SCAN_PAGES } from "@/lib/receipts/scans";
import { usableItems, usableVatLines } from "@/lib/receipts/receipt-fields";
import { DUPLICATE_NOTE as SHARED_DUPLICATE_NOTE, isPossibleDuplicate, scanPageNote } from "@/lib/receipts/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const DUPLICATE_NOTE = SHARED_DUPLICATE_NOTE;

export async function POST(request: NextRequest) {
  const formPromise = request.formData().then(
    (form) => ({ form }),
    () => ({ form: null })
  );

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { form } = await formPromise;
  const clientRaw = form?.get("client_id");
  const clientId = typeof clientRaw === "string" && UUID.test(clientRaw) ? clientRaw.toLowerCase() : null;
  if (clientId) {
    // Before the limits and the reading: a resend costs nothing.
    const saved = await findByClientId(user.id, clientId);
    if (saved) return savedResponse(saved);
  }

  // A read and a save in one: both limits count.
  const [access, ocrLimited, captureLimited] = await Promise.all([
    hasProductAccess(user.id),
    rateLimit("ocr", user.id),
    rateLimit("capture", user.id),
  ]);
  if (!access) return subscriptionRequiredResponse();
  if (!ocrLimited.ok) return rateLimitedResponse(ocrLimited.retryAfterSeconds);
  if (!captureLimited.ok) return rateLimitedResponse(captureLimited.retryAfterSeconds);

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
  const whole = form?.get("whole") === "1";
  if (file.type === "application/pdf") {
    const pages = await pdfPageCount(bytes);
    if (pages === null) return NextResponse.json({ error: "This PDF couldn't be opened." }, { status: 400 });
    if (whole ? pages > MAX_PDF_PAGES : pages > 1) {
      return NextResponse.json(
        { error: whole ? `Up to ${MAX_PDF_PAGES} pages can be read as one receipt.` : "Send one page at a time." },
        { status: 400 }
      );
    }
  }

  // A page of a stored scan: the scan is this user's own, under our naming.
  const scanRaw = form?.get("scan");
  let scan: { path: string; page: number; pages: number } | null = null;
  if (typeof scanRaw === "string" && scanRaw) {
    const page = Number(form?.get("page"));
    const pages = Number(form?.get("pages"));
    if (
      file.type !== "application/pdf" ||
      whole ||
      !isOwnScanPath(user.id, scanRaw) ||
      !Number.isInteger(page) ||
      !Number.isInteger(pages) ||
      page < 1 ||
      pages < 2 ||
      pages > MAX_SCAN_PAGES ||
      page > pages
    ) {
      return NextResponse.json({ error: "invalid scan" }, { status: 400 });
    }
    scan = { path: scanRaw, page, pages };
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
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "This doesn't look like a receipt.",
    });
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

  const row = {
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
      notes:
        [
          scan ? scanPageNote(scan.page, scan.pages) : null,
          duplicate ? DUPLICATE_NOTE : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
      original_source_url: scan ? scan.path : null,
      original_source_kind: scan ? "application/pdf" : null,
      image_url: path,
      image_captured_at: new Date().toISOString(),
      source: "paper",
      status,
      parse_confidence: fields.parse_confidence,
  };
  const insert = (values: Record<string, unknown>) =>
    db.from("receipts").insert(values).select(SAVED_COLUMNS).single<SavedRow>();

  let { data: inserted, error: insertError } = await insert(
    clientId ? { ...row, client_upload_id: clientId } : row,
  );
  if (insertError && clientId && insertError.code === "23505") {
    // The same scan arrived twice at once and the other copy won: answer
    // with its receipt and drop this copy's file.
    await db.storage.from("receipts").remove([path]).catch(() => {});
    const saved = await findByClientId(user.id, clientId);
    if (saved) return savedResponse(saved);
  } else if (insertError && clientId && isMissingColumn(insertError)) {
    // The 2026-11-10 schema block isn't applied yet: save without the id.
    ({ data: inserted, error: insertError } = await insert(row));
  }
  if (insertError || !inserted) {
    await db.storage.from("receipts").remove([path]).catch(() => {});
    console.error("[/api/capture/scan] insert failed", insertError?.code);
    return NextResponse.json({ error: "Couldn't save the receipt. Try again." }, { status: 500 });
  }

  return savedResponse(inserted);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAVED_COLUMNS = "id, merchant_name, total, currency, receipt_date, purchased_at, status, notes";

type SavedRow = {
  id: string;
  merchant_name: string | null;
  total: number | null;
  currency: string;
  receipt_date: string | null;
  purchased_at: string | null;
  status: string;
  notes: string | null;
};

// Postgres "undefined column", or PostgREST's "column not in the schema cache".
function isMissingColumn(error: { code?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204";
}

/** The receipt this user's app already made from this scan, if any. */
async function findByClientId(userId: string, clientId: string): Promise<SavedRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .select(SAVED_COLUMNS)
    .eq("user_id", userId)
    .eq("client_upload_id", clientId)
    .maybeSingle<SavedRow>();
  // Before the schema block is applied the column doesn't exist: no resend
  // can be recognised, and the scan is read as before.
  if (error) return null;
  return data ?? null;
}

function savedResponse(saved: SavedRow) {
  const missing = missingRequiredFields(saved);
  return NextResponse.json({
    ok: true,
    id: saved.id,
    merchant: saved.merchant_name,
    total: saved.total,
    currency: saved.currency,
    receiptDate: saved.receipt_date,
    status: saved.status,
    missing: missing.length > 0 ? missingFieldsText(missing) : null,
    duplicate: isPossibleDuplicate(saved.notes),
  });
}
