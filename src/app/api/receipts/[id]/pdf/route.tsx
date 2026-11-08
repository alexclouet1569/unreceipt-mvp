import { after, NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createHash } from "node:crypto";
import { getServerUser } from "@/lib/supabase-server";
import { loadReceiptForActor, ReceiptAccessError } from "@/lib/receipts/access";
import { ReceiptPdf, pdfFilenameFor } from "@/components/receipt/ReceiptPdf";
import { missingRequiredFields } from "@/lib/receipts/status";
import type { Receipt } from "@/lib/types";

// react-pdf uses fontkit + Node streams; the route MUST run on Node, not
// the Edge runtime. PDF generation can take a few hundred ms on a cold
// font load — bump the function timeout to 30s as a safety margin.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Recently rendered PDFs, in this function instance's memory. The receipt
// detail view asks for its PDF to be prepared (`?prepare=1`) when it opens,
// so tapping Download a moment later skips the render (and, on a cold
// instance, react-pdf's start-up). Keyed by a hash of the whole receipt row,
// so any change to it (an edit, a re-read, VAT, a conversion) renders anew:
// `updated_at` is not maintained on receipts and can't be the key. Access
// is checked on every request, cached or not. About 30-100 KB each.
const PDF_CACHE_MAX = 30;
const pdfCache = new Map<string, Uint8Array>();
// Renders in progress, so a prepare and a download at the same moment
// render once.
const rendering = new Map<string, Promise<Uint8Array>>();
const cacheKey = (r: Receipt) => createHash("sha256").update(JSON.stringify(r)).digest("hex");

async function renderPdf(receipt: Receipt): Promise<Uint8Array> {
  const key = cacheKey(receipt);
  const hit = pdfCache.get(key);
  if (hit) {
    // Most recently used goes last.
    pdfCache.delete(key);
    pdfCache.set(key, hit);
    return hit;
  }
  const inFlight = rendering.get(key);
  if (inFlight) return inFlight;
  const render = (async () => {
    try {
      const pdf = new Uint8Array(await renderToBuffer(<ReceiptPdf receipt={receipt} />));
      pdfCache.set(key, pdf);
      while (pdfCache.size > PDF_CACHE_MAX) pdfCache.delete(pdfCache.keys().next().value as string);
      return pdf;
    } finally {
      rendering.delete(key);
    }
  })();
  rendering.set(key, render);
  return render;
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  // Reject obviously-bogus IDs before hitting the DB. Supabase would
  // return a "invalid input syntax for type uuid" error otherwise — 404
  // is the right user-facing response either way.
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Owner, or staff of the accounting firm linked to the receipt's company.
  let access;
  try {
    access = await loadReceiptForActor(user, id);
  } catch (err) {
    if (err instanceof ReceiptAccessError) {
      console.error("[api/receipts/:id/pdf] fetch failed");
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    throw err;
  }
  if (!access) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const receipt: Receipt = access.receipt;

  // A receipt still in review isn't something to hand to finance yet —
  // the UI hides the button, this is the server-side backstop.
  if (receipt.status === "pending_review") {
    return NextResponse.json(
      {
        error: "review_required",
        missing_fields: missingRequiredFields({
          merchant_name: receipt.merchant_name,
          purchased_at: receipt.purchased_at,
          receipt_date: receipt.receipt_date,
          total: receipt.total,
        }),
      },
      { status: 409 }
    );
  }

  // Prepare only: render into the cache after answering.
  if (request.nextUrl.searchParams.get("prepare") === "1") {
    after(() =>
      renderPdf(receipt).catch((err) => console.error("[api/receipts/:id/pdf] prepare failed", err)),
    );
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  let pdf: Uint8Array;
  try {
    pdf = await renderPdf(receipt);
  } catch (err) {
    console.error("[api/receipts/:id/pdf] render failed", err);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }

  const filename = pdfFilenameFor(receipt);
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "Content-Length": String(pdf.byteLength),
    },
  });
}
