import * as Sentry from "@sentry/nextjs";
import { after, NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth-admin";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import {
  hasProductAccess,
  subscriptionRequiredResponse,
} from "@/lib/subscription-gate";
import { countPdfPages, MAX_PDF_PAGES } from "@/lib/receipts/pdf-pages";
import {
  extractReceipt,
  extractReceiptStreaming,
  partialOcrFields,
  type OcrMediaType,
} from "@/lib/ocr";
import {
  MAX_UPLOAD_BYTES,
  isAllowedUploadType,
} from "@/lib/receipts/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision calls typically resolve in 2-3s (OCR eval, 2026-11-07); give 30s
// headroom for long receipts and multi-page PDFs.
export const maxDuration = 30;

// Warm-up, sent by the capture sheet when it opens: by the time the photo
// is taken this function is running (no cold start) and holds an open
// connection to the Anthropic API. Signed-in users only; it calls no model.
export async function GET() {
  const user = await getServerUser();
  if (!user) return new NextResponse(null, { status: 401 });
  after(() =>
    fetch("https://api.anthropic.com/", { method: "HEAD", signal: AbortSignal.timeout(3000) }).catch(
      () => {},
    ),
  );
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  // The photo keeps arriving while the checks below run.
  const formPromise = request.formData().then(
    (form) => ({ form }),
    () => ({ form: null }),
  );

  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Founders use OCR from /admin's paste form without a subscription of
  // their own; they stay rate-limited like everyone else. The two checks
  // are independent, so they run together.
  const [access, limited] = await Promise.all([
    isAdminEmail(user.email) ? Promise.resolve(true) : hasProductAccess(user.id),
    rateLimit("ocr", user.id),
  ]);
  if (!access) return subscriptionRequiredResponse();
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const { form } = await formPromise;
  if (!form) {
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
    if (request.nextUrl.searchParams.get("stream") === "1") {
      return streamedResponse(base64, type as OcrMediaType, request.signal);
    }
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

/**
 * `?stream=1` (the capture sheet): newline-delimited JSON. `partial` lines
 * carry the form fields as soon as they are read (the total and date come
 * about a second in; the line items take longer), then one `result` line
 * with the full answer, or one `error` line. The form fills in from the
 * first partial instead of waiting for the whole receipt.
 */
function streamedResponse(base64: string, mediaType: OcrMediaType, requestSignal: AbortSignal): Response {
  const encoder = new TextEncoder();
  // The phone went away (sheet closed, app in the background, network
  // lost): stop the model instead of paying for an answer nobody reads.
  const abort = new AbortController();
  const stop = () => abort.abort();
  requestSignal.addEventListener("abort", stop, { once: true });
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      };
      let lastSent = "";
      try {
        const call = await extractReceiptStreaming(
          base64,
          mediaType,
          (textSoFar) => {
            const fields = partialOcrFields(textSoFar);
            const key = JSON.stringify(fields);
            if (key !== lastSent && key !== "{}") {
              lastSent = key;
              send({ type: "partial", fields });
            }
          },
          abort.signal,
        );
        send({ type: "result", result: call.result });
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("[/api/ocr] streamed extract failed:", err);
          Sentry.captureException(err, { tags: { area: "ocr" } });
          send({ type: "error", error: "couldn't read this receipt" });
        }
      } finally {
        requestSignal.removeEventListener("abort", stop);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      stop();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
