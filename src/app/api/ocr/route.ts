import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth-admin";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import {
  hasProductAccess,
  subscriptionRequiredResponse,
} from "@/lib/subscription-gate";
import { extractReceipt, type OcrMediaType } from "@/lib/ocr";
import { pdfPageCount } from "@/lib/receipts/pdf-pages";
import {
  MAX_PDF_PAGES,
  MAX_UPLOAD_BYTES,
  countPdfPages,
  isAllowedUploadType,
} from "@/lib/receipts/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision calls typically resolve in 3-8s; give 30s headroom for large
// images and multi-page PDFs.
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Founders use OCR from /admin's paste form without a subscription of
  // their own; they stay rate-limited like everyone else.
  if (!isAdminEmail(user.email) && !(await hasProductAccess(user.id))) {
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
      // The byte-scan is only a fallback for PDFs the parser can't open.
      const pages = (await pdfPageCount(buf)) ?? countPdfPages(buf);
      if (pages > MAX_PDF_PAGES) {
        return NextResponse.json(
          {
            error: `PDF has ${pages} pages — we currently support up to ${MAX_PDF_PAGES}. Split the file and try again.`,
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
