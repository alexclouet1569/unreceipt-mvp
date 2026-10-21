// SERVER-ONLY. Loads one month of an expense claim and builds its PDF.
// Uses the service-role client (scoped to the user inline) and
// @react-pdf — never import from a "use client" file.
//
// The PDF goes through the private `exports` bucket and a short-lived
// signed URL, like the accountant export: it embeds every receipt photo,
// so a month easily passes the 4.5 MB a Vercel Function may return. The
// daily cleanup cron removes it after EXPORT_TTL_HOURS.

import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOwnedStoragePath } from "@/lib/receipts/storage-path";
import {
  EXPORT_BUCKET,
  SIGNED_URL_SECONDS,
  monthRange,
} from "@/lib/export/build-export";
import { ClaimPdf, type ClaimPdfImage } from "@/components/receipt/ClaimPdf";
import type { Receipt } from "@/lib/types";
import {
  buildClaimLines,
  claimTotals,
  type ClaimLine,
  type ClaimReceipt,
  type PurposeHistoryEntry,
} from "./claim";

// A month of business travel is a few dozen receipts; this bounds one
// request's work and the PDF's size.
export const MAX_CLAIM_RECEIPTS = 150;
// Photos beyond this many bytes in one PDF show a placeholder instead, so
// the file stays under Supabase Free's 50 MB per-object cap.
const MAX_IMAGE_BYTES_PER_PDF = 40 * 1024 * 1024;
const HISTORY_LIMIT = 500;

const CLAIM_COLUMNS =
  "id, merchant_name, merchant_address, category, currency, total, receipt_date, " +
  "receipt_time, purchased_at, status, items, image_url, original_source_kind, " +
  "claim_place, claim_purpose, claim_type";

export type ClaimRow = ClaimReceipt &
  Pick<Receipt, "image_url" | "original_source_kind">;

export class ClaimTooLargeError extends Error {
  constructor() {
    super("too many receipts for one claim");
    this.name = "ClaimTooLargeError";
  }
}

export interface ClaimData {
  lines: ClaimLine[];
  rows: ClaimRow[];
  history: PurposeHistoryEntry[];
}

/** Every receipt of `month` (YYYY-MM, already validated) as claim lines. */
export async function loadClaim(userId: string, month: string): Promise<ClaimData> {
  const { start, end } = monthRange(month);
  const admin = getSupabaseAdmin();
  const [receiptsRes, historyRes] = await Promise.all([
    admin
      .from("receipts")
      .select(CLAIM_COLUMNS)
      .eq("user_id", userId)
      // Same month rule as the accountant export: purchase date first,
      // receipt_date for rows from before purchased_at existed.
      .or(
        `and(purchased_at.gte.${start},purchased_at.lt.${end}),` +
          `and(purchased_at.is.null,receipt_date.gte.${start},receipt_date.lt.${end})`,
      )
      .limit(MAX_CLAIM_RECEIPTS + 1),
    // Purposes saved before, to suggest one for a place visited again.
    admin
      .from("receipts")
      .select("claim_place, claim_purpose, purchased_at, receipt_date")
      .eq("user_id", userId)
      .not("claim_purpose", "is", null)
      .not("claim_place", "is", null)
      .order("purchased_at", { ascending: false, nullsFirst: false })
      .limit(HISTORY_LIMIT),
  ]);
  if (receiptsRes.error) throw new Error(`claim query failed (${receiptsRes.error.code})`);
  const rows = (receiptsRes.data ?? []) as unknown as ClaimRow[];
  if (rows.length > MAX_CLAIM_RECEIPTS) throw new ClaimTooLargeError();
  // History only improves suggestions: a failed read leaves them out.
  const history = historyRes.error
    ? []
    : ((historyRes.data ?? []) as PurposeHistoryEntry[]);
  return { lines: buildClaimLines(rows, history), rows, history };
}

// What a photo is, from its first bytes: react-pdf embeds JPEG and PNG only.
function rasterFormat(data: Uint8Array): "jpg" | "png" | null {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "png";
  return null;
}

async function loadImages(
  userId: string,
  lines: ClaimLine[],
  rows: ClaimRow[],
): Promise<Record<string, ClaimPdfImage>> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const storage = getSupabaseAdmin().storage.from("receipts");
  const images: Record<string, ClaimPdfImage> = {};
  let budget = MAX_IMAGE_BYTES_PER_PDF;

  for (const line of lines) {
    const row = byId.get(line.receipt.id);
    const path = row?.image_url;
    if (!path || !isOwnedStoragePath(path, userId)) {
      images[line.receipt.id] = {
        kind: "none",
        reason:
          row?.original_source_kind === "eml" || row?.original_source_kind === "application/pdf"
            ? "This receipt arrived by email. The original is kept in UnReceipt; print it from there if it must be attached."
            : "No photo of this receipt.",
      };
      continue;
    }
    const { data, error } = await storage.download(path);
    if (error || !data) {
      images[line.receipt.id] = { kind: "none", reason: "The photo couldn't be loaded." };
      continue;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    const format = rasterFormat(bytes);
    if (!format) {
      images[line.receipt.id] = {
        kind: "none",
        reason: "This receipt is a PDF or WebP file, which can't be placed here. It is kept in UnReceipt.",
      };
      continue;
    }
    if (bytes.byteLength > budget) {
      images[line.receipt.id] = {
        kind: "none",
        reason: "Too many photos for one file. This one is kept in UnReceipt.",
      };
      continue;
    }
    budget -= bytes.byteLength;
    images[line.receipt.id] = { kind: "image", data: Buffer.from(bytes), format };
  }
  return images;
}

// Keep at most one claim PDF per user in storage, like the export: each one
// copies a month of photos and storage is shared (Supabase Free: 1 GB for
// everything). The user's ZIP exports are left alone.
async function removePreviousClaims(userId: string): Promise<void> {
  const storage = getSupabaseAdmin().storage.from(EXPORT_BUCKET);
  const { data, error } = await storage.list(userId, { limit: 1000, search: "claim-" });
  if (error || !data) return;
  const paths = data
    .filter((f) => f.id != null && f.name.startsWith("claim-"))
    .map((f) => `${userId}/${f.name}`);
  if (paths.length > 0) await storage.remove(paths);
}

export interface ClaimPdfResult {
  url: string;
  filename: string;
  receiptCount: number;
  pendingCount: number;
}

/**
 * Renders the month's claim (ready receipts only), stores it under
 * exports/<user_id>/ and returns a signed download URL.
 */
export async function buildClaimPdf(
  userId: string,
  month: string,
  person: string,
  now: Date = new Date(),
): Promise<ClaimPdfResult> {
  const { lines: allLines, rows } = await loadClaim(userId, month);
  const pendingCount = allLines.filter((l) => !l.ready).length;
  // Receipts still in review stay off the claim; the others are renumbered
  // so the numbers on the page run 1…n without gaps.
  const lines = allLines
    .filter((l) => l.ready)
    .map((l, i) => ({ ...l, number: i + 1 }));
  const images = await loadImages(userId, lines, rows);

  const pdf = await renderToBuffer(
    createElement(ClaimPdf, {
      month,
      person,
      lines,
      totals: claimTotals(lines),
      images,
      pendingCount,
      generatedOn: now.toISOString().slice(0, 10),
    }) as never,
  );

  const filename = `expense-claim-${month}.pdf`;
  const path = `${userId}/claim-${month}-${crypto.randomUUID()}.pdf`;
  const admin = getSupabaseAdmin();
  await removePreviousClaims(userId);
  const { error: uploadError } = await admin.storage
    .from(EXPORT_BUCKET)
    .upload(path, new Uint8Array(pdf), { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error("claim upload failed");

  const { data: signed, error: signError } = await admin.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS, { download: filename });
  if (signError || !signed) throw new Error("claim sign failed");

  return { url: signed.signedUrl, filename, receiptCount: lines.length, pendingCount };
}
