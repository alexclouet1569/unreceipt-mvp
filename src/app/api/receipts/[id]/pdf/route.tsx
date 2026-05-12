import { NextResponse, type NextRequest } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import type { Readable } from "node:stream";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ReceiptPdf, pdfFilenameFor } from "@/components/receipt/ReceiptPdf";
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

  // Service-role client bypasses RLS; we enforce ownership inline with
  // .eq("user_id") so the gate is explicit and visible at the call site,
  // matching the pattern used by /app's loadReceiptsForUser.
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[api/receipts/:id/pdf] fetch failed", error);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const receipt = data as Receipt;

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
