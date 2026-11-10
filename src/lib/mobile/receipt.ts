// Server rows → what the iPhone app shows. Only display fields: no storage
// paths, edit history, verification codes or OCR internals.

import { missingRequiredFields } from "@/lib/receipts/status";
import { isPossibleDuplicate, userNotes } from "@/lib/receipts/notes";
import type { Receipt } from "@/lib/types";
import type { MobileReceipt } from "./types";

// Same resolution as GET /api/receipts/[id]/original: the stored original
// first, else the paper photo; a kind the row doesn't record is read from
// the file's extension, as that route does (a PDF can sit in image_url).
function kindOf(path: string, recorded: string | null): MobileReceipt["original"] {
  const kind = recorded ?? "";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (kind === "application/pdf" || (!kind && ext === "pdf")) return "pdf";
  if (kind === "eml" || (!kind && ext === "eml")) return "email";
  if (kind === "txt" || (!kind && ext === "txt")) return "text";
  if (kind.startsWith("image/") || (!kind && ["jpg", "jpeg", "png", "webp"].includes(ext))) return "image";
  return null;
}

function originalOf(r: Receipt): MobileReceipt["original"] {
  if (r.original_source_url) return kindOf(r.original_source_url, r.original_source_kind);
  return r.image_url ? kindOf(r.image_url, null) : null;
}

export function toMobileReceipt(r: Receipt): MobileReceipt {
  return {
    id: r.id,
    status: r.status,
    missing: missingRequiredFields(r),
    source: r.source,
    merchant: r.merchant_name,
    category: r.category,
    currency: r.currency,
    total: r.total,
    homeCurrency: r.home_currency,
    homeTotal: r.home_total,
    fxSource: r.fx_source,
    date: r.purchased_at ?? r.receipt_date,
    createdAt: r.created_at,
    original: originalOf(r),
    notes: userNotes(r.notes),
    possibleDuplicate: isPossibleDuplicate(r.notes),
    exportedAt: r.exported_at,
    bookedAt: r.booked_at,
  };
}
