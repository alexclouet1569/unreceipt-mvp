// Original-source viewer endpoint. Returns a short-lived signed URL to
// the raw artifact (paper photo, email .eml, SMS .txt, PDF) backing a
// digital receipt — plus an inline preview for the text-based kinds so
// the client doesn't need a second fetch.
//
// Resolution rule:
//   * original_source_url set  → `receipt-originals` bucket (new intake
//                                paths from steps 5-7).
//   * image_url set            → `receipts` bucket (legacy paper capture
//                                via /api/capture).
//   * neither                  → 404 ("no_original").
//
// RLS-keyed by user_id via the anon-key client. Service-role is not
// needed: the rows are owner-readable, and storage buckets are private
// with policies matching the receipts table.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Receipt, ReceiptOriginalKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

type OriginalPayload = {
  url: string;
  kind: ReceiptOriginalKind;
  filename: string;
  // Inline preview for text-based kinds. Saves the client a round-trip
  // and avoids CORS gotchas when fetching the signed URL from JS.
  preview?:
    | {
        type: "eml";
        from: string | null;
        to: string | null;
        subject: string | null;
        date: string | null;
        text: string;
      }
    | {
        type: "txt";
        body: string;
      };
};

type NoOriginal = { error: "no_original" };

async function getUserScopedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* read-only context */
        }
      },
    },
  });
}

function inferKindFromPath(path: string): ReceiptOriginalKind {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  if (ext === "eml") return "eml";
  if (ext === "txt") return "txt";
  return "image/jpeg";
}

function filenameFor(receipt: Receipt, kind: ReceiptOriginalKind): string {
  const slug = (receipt.merchant_name ?? "receipt")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "receipt";
  const date = receipt.purchased_at?.slice(0, 10) ?? receipt.receipt_date ?? "";
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

// Extract From / To / Subject / Date headers + text/plain body from a
// raw .eml string. Defensive: real-world .eml varies wildly. If we
// can't parse a field we surface null rather than throwing — the
// viewer still shows the raw body.
function parseEml(raw: string): {
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  text: string;
} {
  // Split headers vs body at the first blank line.
  const split = raw.indexOf("\r\n\r\n");
  const splitIdx = split >= 0 ? split : raw.indexOf("\n\n");
  const headerBlock = splitIdx >= 0 ? raw.slice(0, splitIdx) : raw;
  const bodyBlock = splitIdx >= 0 ? raw.slice(splitIdx).replace(/^\s+/, "") : "";

  const headerLine = (name: string): string | null => {
    const re = new RegExp(`^${name}:\\s*(.+?)(?:\\r?\\n(?!\\s)|$)`, "im");
    const m = headerBlock.match(re);
    return m ? m[1].trim() : null;
  };

  // For multipart MIME, pull the first text/plain part. Fallback to the
  // whole body when there's no boundary marker — covers plain emails.
  const contentType = headerLine("Content-Type") ?? "";
  let textBody = bodyBlock;
  const boundaryMatch = contentType.match(/boundary="?([^";\r\n]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = bodyBlock.split(`--${boundary}`);
    const plain = parts.find((p) => /content-type:\s*text\/plain/i.test(p));
    if (plain) {
      const partSplit = plain.indexOf("\r\n\r\n");
      const partIdx = partSplit >= 0 ? partSplit : plain.indexOf("\n\n");
      textBody = partIdx >= 0 ? plain.slice(partIdx).trim() : plain.trim();
    }
  }

  // Cap to keep dialog responsive; user can still download the raw .eml
  // via the signed URL if they need the full thing.
  const MAX = 8000;
  if (textBody.length > MAX) {
    textBody = textBody.slice(0, MAX) + "\n\n[…truncated — download original for full message]";
  }

  return {
    from: headerLine("From"),
    to: headerLine("To"),
    subject: headerLine("Subject"),
    date: headerLine("Date"),
    text: textBody,
  };
}

export async function GET(
  _request: NextRequest,
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

  const supabase = await getUserScopedClient();

  // RLS hides other users' rows, so a miss is correctly 404 from the
  // caller's perspective. No need to verify user_id ourselves.
  const { data: row, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const receipt = row as Receipt;

  // Manual rows never have an original — surface that explicitly so the
  // client can hide the tab.
  if (receipt.source === "manual") {
    return NextResponse.json({ error: "no_original" }, { status: 404 });
  }

  // Resolve which bucket + path holds the artifact.
  let bucket: "receipt-originals" | "receipts";
  let path: string;
  let kind: ReceiptOriginalKind;

  if (receipt.original_source_url) {
    bucket = "receipt-originals";
    path = receipt.original_source_url;
    kind = receipt.original_source_kind ?? inferKindFromPath(path);
  } else if (receipt.image_url) {
    bucket = "receipts";
    path = receipt.image_url;
    kind = receipt.original_source_kind ?? inferKindFromPath(path);
  } else {
    return NextResponse.json({ error: "no_original" }, { status: 404 });
  }

  // Mint the signed URL. The row lookup above is RLS-scoped via the
  // user-cookie client (so we already verified ownership). The storage
  // call uses the service-role admin client because storage RLS
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

  // Inline preview for text-based kinds. We download the artifact
  // server-side (small payloads — eml/txt are < 100 KB in practice) so
  // the client doesn't need to fetch the signed URL and worry about
  // CORS / MIME quirks.
  if (kind === "eml" || kind === "txt") {
    try {
      const dl = await admin.storage.from(bucket).download(path);
      if (dl.data) {
        const raw = await dl.data.text();
        if (kind === "eml") {
          payload.preview = { type: "eml", ...parseEml(raw) };
        } else {
          const MAX = 4000;
          payload.preview = {
            type: "txt",
            body:
              raw.length > MAX
                ? raw.slice(0, MAX) + "\n\n[…truncated]"
                : raw,
          };
        }
      }
    } catch (err) {
      // Preview is best-effort; the signed URL still lets the user
      // download the raw artifact.
      console.warn(
        "[/api/receipts/[id]/original] preview fetch failed",
        err
      );
    }
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
