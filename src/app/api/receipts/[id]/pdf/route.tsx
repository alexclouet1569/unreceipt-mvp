import { NextResponse, type NextRequest } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import type { Readable } from "node:stream";
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

export async function GET(
  _request: NextRequest,
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

  let nodeStream: Readable;
  try {
    nodeStream = (await renderToStream(<ReceiptPdf receipt={receipt} />)) as Readable;
  } catch (err) {
    console.error("[api/receipts/:id/pdf] render failed", err);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }

  // Convert Node Readable into a Web ReadableStream so the Next.js Node
  // runtime can stream it back without buffering the whole PDF in memory.
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer | string) => {
        controller.enqueue(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk
        );
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  const filename = pdfFilenameFor(receipt);
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
