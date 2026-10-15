// SERVER-ONLY. Builds the accountant export (launch plan action 45): a ZIP
// with receipts.csv, one PDF per ready receipt and every original file as
// received. Uses the service-role client and @react-pdf — never import from
// a "use client" file.
//
// Why it goes through storage: a Vercel Function response is capped at
// 4.5 MB (checked 2026-10-15, vercel.com/docs/functions/limitations), far
// below a month of photos. So the ZIP is written to the private `exports`
// bucket and the browser gets a short-lived signed URL. Supabase Free caps
// any stored file at 50 MB, so a large export is split into parts of at
// most PART_TARGET_BYTES; each part is zipped and uploaded before the next
// is collected, so memory holds about one part at a time.

import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ReceiptPdf, pdfFilenameSlug } from "@/components/receipt/ReceiptPdf";
import { isOwnedStoragePath } from "@/lib/receipts/storage-path";
import type { Receipt } from "@/lib/types";
import { buildReceiptsCsv, receiptDate, type CsvRow } from "./csv";
import { buildZip, zipSize, type ZipEntry } from "./zip";

export const EXPORT_BUCKET = "exports";
export const PART_TARGET_BYTES = 40 * 1024 * 1024;
// A month is normally tens of receipts; this bounds one request's work
// (Hobby functions stop at 300 s).
export const MAX_EXPORT_RECEIPTS = 1000;
export const SIGNED_URL_SECONDS = 15 * 60;
// Exports are deleted by the daily cron after this long.
export const EXPORT_TTL_HOURS = 24;

export type ExportPeriod =
  | { kind: "month"; month: string }
  | { kind: "year"; year: string }
  | { kind: "all" };

export class ExportTooLargeError extends Error {
  constructor() {
    super("too many receipts for one export");
    this.name = "ExportTooLargeError";
  }
}

/**
 * "2026-10" → month; "2026" → calendar year; "all" → everything; anything
 * else → null. Strict, because the value ends up in a PostgREST filter.
 */
export function parsePeriod(input: unknown): ExportPeriod | null {
  if (input === "all") return { kind: "all" };
  if (typeof input !== "string") return null;
  const y = /^(\d{4})$/.exec(input);
  if (y) {
    const year = Number(y[1]);
    return year >= 2000 && year <= 2100 ? { kind: "year", year: input } : null;
  }
  const m = /^(\d{4})-(\d{2})$/.exec(input);
  if (!m) return null;
  const month = Number(m[2]);
  const year = Number(m[1]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { kind: "month", month: input };
}

/** First day of the month and first day of the next, as YYYY-MM-DD. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, end: `${next}-01` };
}

export function periodLabel(period: ExportPeriod, now: Date): string {
  if (period.kind === "month") return period.month;
  if (period.kind === "year") return period.year;
  return `all-receipts-${now.toISOString().slice(0, 10)}`;
}

function periodRange(period: ExportPeriod): { start: string; end: string } | null {
  if (period.kind === "month") return monthRange(period.month);
  if (period.kind === "year") {
    return { start: `${period.year}-01-01`, end: `${Number(period.year) + 1}-01-01` };
  }
  return null;
}

/** File base name shared by a receipt's PDF and original: date_merchant_id. */
export function fileBase(r: Pick<Receipt, "id" | "merchant_name" | "purchased_at" | "receipt_date">): string {
  const date = receiptDate(r) || "undated";
  const merchant = pdfFilenameSlug(r.merchant_name).slice(0, 40);
  return `${date}_${merchant}_${r.id.replace(/-/g, "").slice(0, 8)}`;
}

function extensionOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "bin";
}

async function loadReceipts(userId: string, period: ExportPeriod): Promise<Receipt[]> {
  let query = getSupabaseAdmin()
    .from("receipts")
    .select("*")
    .eq("user_id", userId);
  const range = periodRange(period);
  if (range) {
    const { start, end } = range;
    // Purchase date decides the month; rows from before purchased_at
    // existed fall back to receipt_date.
    query = query.or(
      `and(purchased_at.gte.${start},purchased_at.lt.${end}),` +
        `and(purchased_at.is.null,receipt_date.gte.${start},receipt_date.lt.${end})`,
    );
  }
  const { data, error } = await query
    .order("purchased_at", { ascending: true, nullsFirst: false })
    .limit(MAX_EXPORT_RECEIPTS + 1);
  if (error) throw new Error(`export query failed (${error.code})`);
  const rows = (data ?? []) as Receipt[];
  if (rows.length > MAX_EXPORT_RECEIPTS) throw new ExportTooLargeError();
  return rows;
}

async function download(bucket: string, path: string): Promise<Uint8Array | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function collectReceipt(
  userId: string,
  r: Receipt,
): Promise<{ row: CsvRow; files: ZipEntry[]; missing: number }> {
  const base = fileBase(r);
  let missing = 0;
  const when = new Date(r.created_at);
  const files: ZipEntry[] = [];
  let pdfFile: string | null = null;
  const originals: string[] = [];

  // Same rule as /api/receipts/[id]/pdf: a receipt still waiting for
  // review has no PDF yet. Its original is still exported.
  if (r.status === "verified") {
    try {
      const pdf = await renderToBuffer(createElement(ReceiptPdf, { receipt: r }) as never);
      pdfFile = `pdf/${base}.pdf`;
      files.push({ name: pdfFile, data: new Uint8Array(pdf), date: when });
    } catch (err) {
      missing++;
      pdfFile = "(could not be created)";
      console.error("[export] pdf render failed", { receipt: r.id, err: String(err) });
    }
  }

  const sources: Array<{ bucket: string; path: string | null; suffix: string }> = [
    { bucket: "receipts", path: r.image_url, suffix: "" },
    { bucket: "receipt-originals", path: r.original_source_url, suffix: "-original" },
  ];
  for (const { bucket, path, suffix } of sources) {
    if (!path || !isOwnedStoragePath(path, userId)) continue;
    const data = await download(bucket, path);
    if (!data) {
      missing++;
      originals.push("(missing)");
      continue;
    }
    const name = `originals/${base}${originals.length > 0 ? suffix : ""}.${extensionOf(path)}`;
    originals.push(name);
    files.push({ name, data, date: when });
  }

  return {
    row: { receipt: r, pdfFile, originalFile: originals.join(" | ") || null },
    files,
    missing,
  };
}

function readme(
  label: string,
  receiptCount: number,
  partNo: number | null,
  now: Date,
  missing: number | null,
): string {
  return [
    `UnReceipt export — ${label}`,
    `Created ${now.toISOString().slice(0, 16).replace("T", " ")} UTC · ${receiptCount} receipt(s)`,
    ...(missing
      ? [
          "",
          `WARNING: ${missing} file(s) could not be included. They are marked in`,
          "receipts.csv. Try the export again, or write to support@unreceipt.com.",
        ]
      : []),
    ...(partNo != null
      ? [`This is part ${partNo}. receipts.csv, in the last part, lists every receipt.`]
      : []),
    "",
    "receipts.csv  One line per receipt. Semicolon-separated, decimal comma (opens",
    "              directly in Excel or Numbers set to Swedish).",
    "pdf/          The digital receipt for every receipt that is ready. Receipts you",
    "              edited say so on the PDF, with the original values.",
    "originals/    Each receipt's original file as it was uploaded or received: the",
    "              photo or PDF you captured (large photos are resized on your phone",
    "              before upload), or the forwarded email (.eml), byte for byte.",
    "edit-history.json  For receipts you corrected: every change, when, and the",
    "              value before. Only present when something was edited.",
    "",
    'Receipts marked "Needs review" in the CSV have no PDF yet: open them in the',
    "app and complete them.",
    "",
  ].join("\r\n");
}

export type ExportPart = { path: string; filename: string; url: string; bytes: number };
export type ExportResult = {
  receiptCount: number;
  // PDFs that failed to render plus originals that couldn't be read.
  missing: number;
  parts: ExportPart[];
};

async function removePreviousExports(userId: string): Promise<void> {
  const storage = getSupabaseAdmin().storage.from(EXPORT_BUCKET);
  const { data, error } = await storage.list(userId, { limit: 1000 });
  if (error || !data || data.length === 0) return;
  const paths = data.filter((f) => f.id != null).map((f) => `${userId}/${f.name}`);
  if (paths.length > 0) await storage.remove(paths);
}

export async function buildExport(
  userId: string,
  period: ExportPeriod,
  now: Date = new Date(),
): Promise<ExportResult> {
  const receipts = await loadReceipts(userId, period);
  if (receipts.length === 0) return { receiptCount: 0, missing: 0, parts: [] };
  // Keep at most one export per user in storage: each one copies every
  // file, and storage is shared (Supabase Free: 1 GB for everything).
  await removePreviousExports(userId);
  const label = periodLabel(period, now);
  const enc = new TextEncoder();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const admin = getSupabaseAdmin();

  const parts: ExportPart[] = [];
  const rows: CsvRow[] = [];
  let missing = 0;
  let pending: ZipEntry[] = [];
  let pendingBytes = 0;

  // Zips and uploads what's collected so far. `partNo` is null only when
  // the whole export fits in one file.
  const flush = async (partNo: number | null, extra: ZipEntry[], missingNow: number | null) => {
    const entries: ZipEntry[] = [
      {
        name: "README.txt",
        data: enc.encode(readme(label, receipts.length, partNo, now, missingNow)),
        date: now,
      },
      ...extra,
      ...pending,
    ];
    const zip = buildZip(entries);
    pending = [];
    pendingBytes = 0;

    const suffix = partNo != null ? `-part-${partNo}` : "";
    const filename = `unreceipt-${label}${suffix}.zip`;
    const path = `${userId}/${stamp}-${label}${suffix}.zip`;
    const { error: uploadError } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(path, zip, { contentType: "application/zip", upsert: false });
    if (uploadError) throw new Error("export upload failed");

    const { data: signed, error: signError } = await admin.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS, { download: filename });
    if (signError || !signed) throw new Error("export sign failed");
    parts.push({ path, filename, url: signed.signedUrl, bytes: zip.length });
  };

  // One receipt at a time; a part is uploaded as soon as the next receipt
  // would push it past the target, so memory holds about one part.
  for (const r of receipts) {
    const { row, files, missing: m } = await collectReceipt(userId, r);
    missing += m;
    rows.push(row);
    const size = zipSize(files.map((f) => ({ name: f.name, size: f.data.length })));
    if (pending.length > 0 && pendingBytes + size > PART_TARGET_BYTES) {
      await flush(parts.length + 1, [], null);
    }
    pending.push(...files);
    pendingBytes += size;
  }

  const last: ZipEntry[] = [
    { name: "receipts.csv", data: enc.encode(buildReceiptsCsv(rows)), date: now },
  ];
  // The full correction trail (who/when/before/after), so it survives the
  // account: the PDF shows the original values, this shows every step.
  const edited = receipts
    .filter((r) => Array.isArray(r.edit_history) && r.edit_history.length > 0)
    .map((r) => ({
      receipt_id: r.id,
      merchant: r.merchant_name,
      date: receiptDate(r),
      edits: r.edit_history,
    }));
  if (edited.length > 0) {
    last.push({
      name: "edit-history.json",
      data: enc.encode(JSON.stringify(edited, null, 2)),
      date: now,
    });
  }
  await flush(parts.length > 0 ? parts.length + 1 : null, last, missing);
  if (missing > 0) {
    console.error("[export] files missing from export", { count: missing });
  }

  return { receiptCount: receipts.length, missing, parts };
}
