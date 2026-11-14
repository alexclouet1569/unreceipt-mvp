// Where a receipt's original file lives, shared by GET
// /api/receipts/[id]/original (link, preview) and
// GET /api/receipts/[id]/original/page/[n] (a PDF page as a picture).
//
//   * original_source_url set → `receipt-originals` bucket (email, scans,
//                                mailbox and SMS intake).
//   * image_url set           → `receipts` bucket (paper capture).
//   * neither, or a manual row → no original.
//
// The path must sit in the receipt OWNER's folder, whoever is looking (a
// firm reads its client's file through the service role).

import { isOwnedStoragePath } from "./storage-path";
import type { Receipt, ReceiptOriginalKind } from "@/lib/types";

export type OriginalFile = {
  bucket: "receipt-originals" | "receipts";
  path: string;
  kind: ReceiptOriginalKind;
};

export function inferKindFromPath(path: string): ReceiptOriginalKind {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  if (ext === "eml") return "eml";
  if (ext === "txt") return "txt";
  return "image/jpeg";
}

export function originalFileOf(
  receipt: Pick<Receipt, "source" | "user_id" | "original_source_url" | "original_source_kind" | "image_url">,
): OriginalFile | null {
  if (receipt.source === "manual") return null;
  let file: OriginalFile;
  if (receipt.original_source_url) {
    const path = receipt.original_source_url;
    file = { bucket: "receipt-originals", path, kind: receipt.original_source_kind ?? inferKindFromPath(path) };
  } else if (receipt.image_url) {
    const path = receipt.image_url;
    file = { bucket: "receipts", path, kind: receipt.original_source_kind ?? inferKindFromPath(path) };
  } else {
    return null;
  }
  return isOwnedStoragePath(file.path, receipt.user_id) ? file : null;
}
