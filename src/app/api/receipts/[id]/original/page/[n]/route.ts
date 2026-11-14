// GET /api/receipts/[id]/original/page/[n] — page n (1-based, at most 10) of
// a receipt's PDF original as a PNG, drawn on the server
// (src/lib/receipts/pdf-render.ts). The website's and the iPhone app's
// "Original" view show these pictures instead of the PDF itself, so no PDF
// viewer ever runs the file's JavaScript, follows its links or loads
// anything. Same access as ../route.ts: the owner, or staff of the linked
// accounting firm (a mailbox receipt only once confirmed), through
// loadReceiptForActor(); the file must be in the owner's folder. Rate
// limited (originalView): drawing a page costs CPU.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { loadReceiptForActor, ReceiptAccessError } from "@/lib/receipts/access";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { originalFileOf } from "@/lib/receipts/original-file";
import { PdfPreviewError, renderPdfPage } from "@/lib/receipts/pdf-render";
import { MAX_PDF_PAGES } from "@/lib/receipts/pdf-pages";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> },
) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const { id, n } = await params;
  const page = /^\d{1,2}$/.test(n) ? Number(n) : NaN;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(page) || page < 1 || page > MAX_PDF_PAGES) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  }

  let access;
  try {
    access = await loadReceiptForActor(user, id);
  } catch (err) {
    if (err instanceof ReceiptAccessError) {
      return NextResponse.json({ error: "lookup failed" }, { status: 500, headers: NO_STORE });
    }
    throw err;
  }
  // A receipt the caller may not see is a miss, like one that doesn't exist.
  if (!access) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  }
  const file = originalFileOf(access.receipt);
  if (!file || file.kind !== "application/pdf") {
    return NextResponse.json({ error: "no_pdf" }, { status: 404, headers: NO_STORE });
  }

  const limited = await rateLimit("originalView", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const dl = await getSupabaseAdmin().storage.from(file.bucket).download(file.path);
  if (!dl.data) {
    console.error("[/api/receipts/[id]/original/page] download failed");
    return NextResponse.json({ error: "download_failed" }, { status: 502, headers: NO_STORE });
  }

  try {
    const png = await renderPdfPage(new Uint8Array(await dl.data.arrayBuffer()), page);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="page-${page}.png"`,
        // The picture never changes (an original is never replaced); kept
        // briefly in this browser or phone only, never in a shared cache.
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof PdfPreviewError && err.reason === "page_out_of_range") {
      return NextResponse.json({ error: "no_page" }, { status: 404, headers: NO_STORE });
    }
    const reason = err instanceof PdfPreviewError ? err.reason : "error";
    console.error("[/api/receipts/[id]/original/page] render failed", reason);
    if (reason !== "unreadable") Sentry.captureException(err, { tags: { area: "original preview", reason } });
    return NextResponse.json({ error: "unreadable" }, { status: 422, headers: NO_STORE });
  }
}
