import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import {
  hasProductAccess,
  subscriptionRequiredResponse,
} from "@/lib/subscription-gate";
import { extractReceipt, type OcrMediaType } from "@/lib/ocr";
import {
  MAX_UPLOAD_BYTES,
  isAllowedUploadType,
} from "@/lib/receipts/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision calls typically resolve in 3-8s; give 30s headroom for large
// images and multi-page PDFs.
export const maxDuration = 30;

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

  if (!(await hasProductAccess(user.id))) {
    return subscriptionRequiredResponse();
  }

  const limited = await rateLimit("ocr", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

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
  if (!isAllowedUploadType(type)) {
    return NextResponse.json(
      { error: `unsupported file type: ${type || "unknown"}` },
      { status: 400 }
    );
  }

  if ((image as Blob).size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "file too large (max 4 MB)" },
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
    Sentry.captureException(err, { tags: { area: "ocr" } });
    return NextResponse.json(
      // Details stay in the server log: Anthropic errors and raw model
      // output aren't for the client.
      { error: "couldn't read this receipt" },
      { status: 500 }
    );
  }
}
