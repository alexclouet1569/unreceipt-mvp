// A receipt's files on the phone: its PDF (the website's
// GET /api/receipts/[id]/pdf, refused while the receipt waits for review)
// and its original (a 5-minute link from GET /api/receipts/[id]/original).
// Each is downloaded into the cache, handed to iOS's share sheet (Save to
// Files, Mail, AirDrop…), and the folder is emptied before the next one:
// they are copies of the user's receipts and shouldn't pile up.

import { Directory, File, Paths } from "expo-file-system";
import { apiResponse, authorizedDownload } from "./api";
import { shareFile } from "./exports";

export type FileOutcome = "shared" | "none" | "failed";

function freshDir(): Directory {
  const dir = new Directory(Paths.cache, "receipt-files");
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  return dir;
}

/** A name we write ourselves: letters, digits, dot, dash and underscore only. */
export function safeFileName(name: string | null | undefined, fallback: string): string {
  const clean = (name ?? "").replace(/[^A-Za-z0-9._-]/g, "").replace(/^\.+/, "").slice(0, 80);
  return /\.[A-Za-z0-9]{2,4}$/.test(clean) ? clean : fallback;
}

/** Throws ApiError when offline or signed out. */
export async function shareReceiptPdf(id: string, merchant: string | null): Promise<FileOutcome> {
  const { url, headers } = await authorizedDownload(`/api/receipts/${encodeURIComponent(id)}/pdf`);
  const slug = (merchant ?? "receipt").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "receipt";
  try {
    const target = new File(freshDir(), safeFileName(`unreceipt-${slug}.pdf`, "unreceipt-receipt.pdf"));
    const file = await File.downloadFileAsync(url, target, { headers, idempotent: true });
    await shareFile(file.uri);
    return "shared";
  } catch {
    return "failed";
  }
}

/** Throws ApiError when offline or signed out. */
export async function shareReceiptOriginal(id: string): Promise<FileOutcome> {
  const res = await apiResponse(`/api/receipts/${encodeURIComponent(id)}/original`);
  const body = (await res.json().catch(() => null)) as { url?: string; filename?: string; error?: string } | null;
  if (res.status === 404) return "none";
  if (!res.ok || !body?.url) return "failed";
  try {
    const target = new File(freshDir(), safeFileName(body.filename, "receipt-original"));
    const file = await File.downloadFileAsync(body.url, target, { idempotent: true });
    await shareFile(file.uri);
    return "shared";
  } catch {
    return "failed";
  }
}
