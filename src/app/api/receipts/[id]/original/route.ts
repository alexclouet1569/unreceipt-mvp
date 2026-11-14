// Original-source viewer endpoint. Returns a short-lived signed URL to
// the raw artifact (paper photo, email .eml, SMS .txt, PDF) backing a
// digital receipt, and with ?preview=1 what the website and the iPhone app
// show of it (`preview`, src/lib/mobile/types.ts OriginalPreview): an email
// or text message as plain text cut on the server (never its HTML), a PDF's
// page sizes (each page is then a PNG from ./page/[n]). Without ?preview
// (sharing, downloading) the file isn't read at all.
//
// Where the file lives: src/lib/receipts/original-file.ts. The row is read
// through loadReceiptForActor(): the owner, or staff of the accounting firm
// linked to the receipt's company (a mailbox receipt only once confirmed,
// src/lib/firm/visibility.ts). Storage paths are checked against the
// OWNER's folder (never the actor's) before signing.

import { printedDay } from "@/lib/receipts/printed-day";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { loadReceiptForActor, ReceiptAccessError } from "@/lib/receipts/access";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { originalFileOf } from "@/lib/receipts/original-file";
import { emailView, textView } from "@/lib/receipts/email-view";
import { pdfPreviewInfo } from "@/lib/receipts/pdf-render";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import type { OriginalPreview, ReceiptOriginal } from "@/lib/mobile/types";
import type { Receipt, ReceiptOriginalKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

type OriginalPayload = ReceiptOriginal;

type NoOriginal = { error: "no_original" };

function filenameFor(receipt: Receipt, kind: ReceiptOriginalKind): string {
  const slug = (receipt.merchant_name ?? "receipt")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "receipt";
  const date = printedDay(receipt) ?? "";
  const ext = (() => {
    switch (kind) {
      case "image/jpeg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "application/pdf":
        return "pdf";
      case "eml":
        return "eml";
      case "txt":
        return "txt";
    }
  })();
  return `original-${slug}${date ? `-${date}` : ""}.${ext}`;
}

async function previewOf(kind: ReceiptOriginalKind, bytes: Buffer): Promise<OriginalPreview | undefined> {
  if (kind === "eml") return emailView(bytes);
  if (kind === "txt") return textView(bytes);
  if (kind === "application/pdf") {
    try {
      return { type: "pdf", ...(await pdfPreviewInfo(new Uint8Array(bytes))) };
    } catch {
      return { type: "unavailable" };
    }
  }
  return undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<OriginalPayload | NoOriginal | { error: string }>> {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // A row the caller may not see is a miss (404), so ids can't be probed.
  let access;
  try {
    access = await loadReceiptForActor(user, id);
  } catch (err) {
    if (err instanceof ReceiptAccessError) {
      return NextResponse.json({ error: "lookup failed" }, { status: 500 });
    }
    throw err;
  }
  if (!access) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const receipt: Receipt = access.receipt;

  // Manual rows never have an original — surface that explicitly so the
  // client can hide the tab.
  const file = originalFileOf(receipt);
  if (!file) {
    return NextResponse.json({ error: "no_original" }, { status: 404 });
  }
  const { bucket, path, kind } = file;

  // Mint the signed URL. The storage call uses the service-role admin
  // client because storage RLS
  // policies for the `receipts` and `receipt-originals` buckets were
  // never wired for anon-key reads — the intake handlers upload via
  // the admin client, and downloads must mirror that.
  const admin = getSupabaseAdmin();
  const { data: signed, error: signError } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error(
      "[/api/receipts/[id]/original] signed url failed:",
      signError
    );
    return NextResponse.json({ error: "signing failed" }, { status: 500 });
  }

  const payload: OriginalPayload = {
    url: signed.signedUrl,
    kind,
    filename: filenameFor(receipt, kind),
  };

  // What the viewers show. Read server-side so the client never fetches
  // (or renders) the raw file itself. A photo needs nothing: its URL is
  // the picture.
  const wantsPreview = request.nextUrl.searchParams.get("preview") === "1";
  if (wantsPreview) {
    const limited = await rateLimit("originalView", user.id);
    if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds) as NextResponse<{ error: string }>;
    // The website's "Download original": the same file, sent as an
    // attachment (a browser ignores <a download> on another site's link
    // and would open a PDF in its own viewer instead).
    const forDownload = await admin.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: payload.filename });
    if (forDownload.data?.signedUrl) payload.downloadUrl = forDownload.data.signedUrl;
  }
  if (wantsPreview && !kind.startsWith("image/")) {
    try {
      const dl = await admin.storage.from(bucket).download(path);
      if (dl.data) {
        payload.preview = await previewOf(kind, Buffer.from(await dl.data.arrayBuffer()));
      } else {
        payload.preview = { type: "unavailable" };
      }
    } catch (err) {
      // Best effort: the signed URL still lets the user download the file.
      console.warn("[/api/receipts/[id]/original] preview failed", err instanceof Error ? err.name : "error");
      payload.preview = { type: "unavailable" };
    }
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
