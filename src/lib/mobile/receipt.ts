// Server rows → what the iPhone app shows. Only display fields: no storage
// paths, edit history, verification codes or OCR internals.

import { missingRequiredFields } from "@/lib/receipts/status";
import { isPossibleDuplicate, userNotes } from "@/lib/receipts/notes";
import type { Receipt } from "@/lib/types";
import type { MobileReceipt } from "./types";

// Same resolution as GET /api/receipts/[id]/original: the stored original
// first, else the legacy paper photo.
function originalOf(r: Receipt): MobileReceipt["original"] {
  if (r.original_source_url) {
    const kind = r.original_source_kind;
    if (kind === "application/pdf") return "pdf";
    if (kind === "eml") return "email";
    if (kind === "txt") return "text";
    if (kind?.startsWith("image/")) return "image";
    return null;
  }
  return r.image_url ? "image" : null;
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
