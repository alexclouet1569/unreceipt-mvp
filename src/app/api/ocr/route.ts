import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { extractReceipt, type OcrMediaType } from "@/lib/ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision calls typically resolve in 3-8s; give 30s headroom for large
// images and multi-page PDFs.
export const maxDuration = 30;

const ALLOWED_TYPES: OcrMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
// 15 MB — image cap was 5 MB but vendor PDFs (Stripe invoices, multi-page
// hotel folios) routinely run 1–8 MB and the old cap silently rejected them.
const MAX_BYTES = 15 * 1024 * 1024;
// Cap PDF page count so a 50-page contract uploaded by mistake doesn't burn
// vision tokens. Counted via /Type /Page occurrences — works for the vast
// majority of PDFs we see in the wild; linearized PDFs may over-count but
// that's a safe-direction error (false rejects, not false accepts).
const MAX_PDF_PAGES = 10;

function countPdfPages(buf: Buffer): number {
  // Match `/Type /Page` (with optional whitespace) but exclude `/Pages`
  // (the catalog node). The negative lookahead `(?!s)` keeps the count
  // accurate on standard PDFs without parsing the cross-ref table.
  const matches = buf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const image = form.get("image");
  if (!image || typeof image === "string" || !("arrayBuffer" in image)) {
    return NextResponse.json(
      { error: "image file required" },
      { status: 400 }
    );
  }

  const type = (image as Blob).type;
  if (!ALLOWED_TYPES.includes(type as OcrMediaType)) {
    return NextResponse.json(
      { error: `unsupported file type: ${type || "unknown"}` },
      { status: 400 }
    );
  }

  if ((image as Blob).size > MAX_BYTES) {
    return NextResponse.json(
      { error: "file too large (max 15MB)" },
      { status: 400 }
    );
  }

  try {
    const buf = Buffer.from(await (image as Blob).arrayBuffer());

    if (type === "application/pdf") {
      const pages = countPdfPages(buf);
      if (pages > MAX_PDF_PAGES) {
        return NextResponse.json(
          {
            error: `PDF has ${pages} pages — we currently support up to ${MAX_PDF_PAGES}. Forward to your receipts@ inbox instead, or split the file.`,
          },
          { status: 400 }
        );
      }
    }

    const base64 = buf.toString("base64");
    const result = await extractReceipt(base64, type as OcrMediaType);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/ocr] extract failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extract failed" },
      { status: 500 }
    );
  }
}
