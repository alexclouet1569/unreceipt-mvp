// Re-run OCR on an existing receipt's stored artifact, then merge the
// fresh extraction onto the row. Lets the user "wake up" receipts that
// were captured before items/VAT extraction worked — or that landed as
// pending_review the first time — so the digital twin renders the full
// line breakdown the customer expects to see.
//
// Owner-only. Reads the row through the anon-key client (RLS gates by
// user_id) and writes the merged update through the service-role admin
// client so we can also re-download from the private storage bucket.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { extractReceipt, type OcrMediaType, type OcrResult } from "@/lib/ocr";
import { computeReceiptStatus } from "@/lib/receipts/status";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";
import type { Receipt, ReceiptItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision calls on multi-page PDFs can take 10-20s; give 30s headroom.
export const maxDuration = 30;

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

function inferMediaTypeFromPath(path: string): OcrMediaType | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return null;
}

// Resolve which storage bucket + path holds the artifact we should
// re-OCR. Mirrors the rule in /api/receipts/[id]/original: new intake
// paths set original_source_url; the legacy capture path sets image_url.
function resolveArtifact(
  receipt: Receipt
): { bucket: "receipt-originals" | "receipts"; path: string } | null {
  if (receipt.original_source_url) {
    return { bucket: "receipt-originals", path: receipt.original_source_url };
  }
  if (receipt.image_url) {
    return { bucket: "receipts", path: receipt.image_url };
  }
  return null;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const supabase = await getUserScopedClient();
  const { data: row, error: readErr } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle<Receipt>();
  if (readErr) {
    console.error("[/api/receipts/reprocess] read failed:", readErr);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const artifact = resolveArtifact(row);
  if (!artifact) {
    return NextResponse.json(
      { error: "no extractable artifact on this receipt" },
      { status: 400 }
    );
  }

  const mediaType = inferMediaTypeFromPath(artifact.path);
  if (!mediaType) {
    // eml/txt go through the email/SMS parser path, not /api/ocr. We
    // don't reprocess those here — surface a clear error so the client
    // can hide the button for those receipts.
    return NextResponse.json(
      { error: "artifact kind is not OCR-eligible" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const { data: blob, error: dlErr } = await admin.storage
    .from(artifact.bucket)
    .download(artifact.path);
  if (dlErr || !blob) {
    console.error("[/api/receipts/reprocess] download failed:", dlErr);
    return NextResponse.json(
      { error: "could not load original artifact" },
      { status: 500 }
    );
  }

  let extracted: OcrResult;
  try {
    const buf = Buffer.from(await blob.arrayBuffer());
    const base64 = buf.toString("base64");
    extracted = await extractReceipt(base64, mediaType);
  } catch (err) {
    console.error("[/api/receipts/reprocess] extract failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extract failed" },
      { status: 500 }
    );
  }

  if (extracted.not_a_receipt) {
    return NextResponse.json(
      { error: "the original doesn't look like a receipt" },
      { status: 422 }
    );
  }

  const merged = mergeExtraction(row, extracted);

  const { data: updated, error: updErr } = await admin
    .from("receipts")
    .update(merged.patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle<Receipt>();
  if (updErr || !updated) {
    console.error("[/api/receipts/reprocess] update failed:", updErr);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, receipt: updated, changed: merged.changed });
}

// Merge rule:
//   - For scalar fields, the new extraction wins ONLY when its
//     self-reported confidence is >= the existing parse_confidence
//     (or existing is null). A re-run of a flaky model shouldn't
//     overwrite fields the user already edited via the Complete form.
//   - `items` are special: if the row currently has no items at all,
//     write whatever the new extraction returned. This is the whole
//     point of the backfill — populate the empty digital twin.
//   - Status is recomputed from the merged result.
export function mergeExtraction(
  existing: Receipt,
  fresh: OcrResult
): { patch: Record<string, unknown>; changed: string[] } {
  const patch: Record<string, unknown> = {};
  const changed: string[] = [];

  const newConf = typeof fresh.confidence === "number" ? fresh.confidence : 0;
  const oldConf = existing.parse_confidence ?? 0;
  const winsOnConfidence = newConf >= oldConf;

  const writeIfBetter = <K extends keyof Receipt>(
    field: K,
    value: Receipt[K] | undefined | null
  ) => {
    if (value == null) return;
    if (existing[field] == null || winsOnConfidence) {
      patch[field as string] = value;
      changed.push(field as string);
    }
  };

  writeIfBetter("merchant_name", typeof fresh.merchant === "string" ? fresh.merchant : null);
  writeIfBetter(
    "total",
    typeof fresh.amount === "number" && Number.isFinite(fresh.amount) ? fresh.amount : null
  );
  if (
    typeof fresh.currency === "string" &&
    (CURRENCY_OPTIONS as readonly string[]).includes(fresh.currency)
  ) {
    writeIfBetter("currency", fresh.currency);
  }
  if (
    typeof fresh.receipt_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(fresh.receipt_date)
  ) {
    writeIfBetter("receipt_date", fresh.receipt_date);
    // Keep purchased_at aligned to the receipt_date (noon UTC), matching
    // the convention from /api/capture so dashboard sorting stays stable.
    const purchasedAt = `${fresh.receipt_date}T12:00:00.000Z`;
    if (existing.purchased_at == null || winsOnConfidence) {
      patch.purchased_at = purchasedAt;
      if (!changed.includes("purchased_at")) changed.push("purchased_at");
    }
  }
  if (
    typeof fresh.category === "string" &&
    (CATEGORY_KEYS as readonly string[]).includes(fresh.category)
  ) {
    writeIfBetter("category", fresh.category as Receipt["category"]);
  }
  writeIfBetter(
    "tax_amount",
    typeof fresh.tax_amount === "number" && Number.isFinite(fresh.tax_amount)
      ? fresh.tax_amount
      : null
  );
  writeIfBetter(
    "tax_rate",
    typeof fresh.tax_rate === "number" && Number.isFinite(fresh.tax_rate)
      ? fresh.tax_rate
      : null
  );
  writeIfBetter(
    "payment_method",
    typeof fresh.payment_method === "string" ? fresh.payment_method : null
  );

  // Items: always backfill if the row currently has none. If it already
  // has some, only overwrite when the new extraction wins on confidence.
  const freshItems: ReceiptItem[] | null =
    Array.isArray(fresh.items) && fresh.items.length > 0
      ? fresh.items.map((it) => ({
          label: it.label,
          qty: it.qty ?? null,
          unit_amount: it.unit_amount ?? null,
          total_amount: it.total_amount,
        }))
      : null;
  const hadItems = existing.items != null && existing.items.length > 0;
  if (freshItems && (!hadItems || winsOnConfidence)) {
    patch.items = freshItems;
    changed.push("items");
  }

  if (newConf > 0) {
    patch.parse_confidence = Math.max(newConf, oldConf);
  }

  // Recompute status from the merged view.
  const mergedView = { ...existing, ...patch } as Receipt;
  patch.status = computeReceiptStatus({
    merchant_name: mergedView.merchant_name,
    purchased_at: mergedView.purchased_at,
    receipt_date: mergedView.receipt_date,
    total: mergedView.total,
    parse_confidence: mergedView.parse_confidence,
  });
  if (patch.status !== existing.status) changed.push("status");

  return { patch, changed };
}
