// Server rows → what the iPhone app shows. Only display fields: no storage
// paths, edit history, verification codes or OCR internals.

import { missingRequiredFields } from "@/lib/receipts/status";
import type { Receipt } from "@/lib/types";
import type { MobileReceipt } from "./types";

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
    hasPhoto: Boolean(r.image_url),
    exportedAt: r.exported_at,
    bookedAt: r.booked_at,
  };
}
