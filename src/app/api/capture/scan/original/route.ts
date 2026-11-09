// POST /api/capture/scan/original — stores a multi-page scan exactly as
// the client chose it (byte for byte) before its pages are read one by one
// (/api/capture/scan with `scan`): every page receipt points at this file
// as its original, so a page that isn't a receipt, a totals page or an
// embedded e-invoice file is never lost (src/lib/receipts/pdf-inspect.ts).
// Only splittable PDFs come here; the others are read whole.

import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { hasProductAccess, subscriptionRequiredResponse } from "@/lib/subscription-gate";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { MAX_UPLOAD_BYTES } from "@/lib/receipts/upload-limits";
import { canSplit, inspectPdf } from "@/lib/receipts/pdf-inspect";
import { MAX_SCAN_PAGES, SCAN_BUCKET, scanPathFor } from "@/lib/receipts/scans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const formPromise = request.formData().then(
    (form) => ({ form }),
    () => ({ form: null })
  );
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [access, limited] = await Promise.all([hasProductAccess(user.id), rateLimit("capture", user.id)]);
  if (!access) return subscriptionRequiredResponse();
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const { form } = await formPromise;
  const file = form?.get("file");
  if (!file || typeof file === "string" || file.type !== "application/pdf" || file.size === 0) {
    return NextResponse.json({ error: "Choose a PDF." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "This file is larger than 4 MB." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const shape = await inspectPdf(new Uint8Array(bytes));
  if (!shape) return NextResponse.json({ error: "This PDF couldn't be opened." }, { status: 400 });
  if (!canSplit(shape)) return NextResponse.json({ error: "This PDF is read as one receipt." }, { status: 400 });
  if (shape.pages > MAX_SCAN_PAGES) {
    return NextResponse.json({ error: `Up to ${MAX_SCAN_PAGES} pages per scan.` }, { status: 400 });
  }

  const path = scanPathFor(user.id);
  const { error } = await getSupabaseAdmin()
    .storage.from(SCAN_BUCKET)
    .upload(path, bytes, { cacheControl: "3600", upsert: false, contentType: "application/pdf" });
  if (error) {
    console.error("[/api/capture/scan/original] upload failed", error.message);
    return NextResponse.json({ error: "Couldn't store the file. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, scan: path, pages: shape.pages });
}
