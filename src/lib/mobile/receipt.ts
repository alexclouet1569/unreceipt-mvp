// Server rows → what the iPhone app shows. Only display fields: no storage
// paths, edit history, verification codes or OCR internals.

import { dayOf, printedDay } from "@/lib/receipts/printed-day";
import { missingRequiredFields } from "@/lib/receipts/status";
import { isPossibleDuplicate, userNotes } from "@/lib/receipts/notes";
import type { Receipt } from "@/lib/types";
import type { MobileReceipt, MobileReceiptDetail } from "./types";

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

/** The home list's sort key of a receipt: "<purchased_at>|<created_at>|<id>" (purchased_at may be empty). */
export function listKeyOf(r: Pick<Receipt, "purchased_at" | "created_at" | "id">): string {
  return `${r.purchased_at ?? ""}|${r.created_at}|${r.id}`;
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
    // The printed day (src/lib/receipts/printed-day.ts); with its clock time
    // when purchased_at is on that same day, as the app shows the time.
    date: dayOf(r.purchased_at) != null && dayOf(r.purchased_at) === printedDay(r) ? r.purchased_at : printedDay(r),
    createdAt: r.created_at,
    listKey: listKeyOf(r),
    original: originalOf(r),
    notes: userNotes(r.notes),
    possibleDuplicate: isPossibleDuplicate(r.notes),
    exportedAt: r.exported_at,
    bookedAt: r.booked_at,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The digital receipt's fields (same rules as the website's ReceiptDetailCard). */
export function toMobileReceiptDetail(r: Receipt): MobileReceiptDetail {
  const vat = r.tax_amount != null && r.tax_amount > 0 ? r.tax_amount : null;
  const lines = Array.isArray(r.vat_lines) && r.vat_lines.length > 1 ? r.vat_lines : [];
  const stamp: MobileReceiptDetail["stamp"] = r.is_verified
    ? r.edited_at
      ? "verified_edited"
      : "verified"
    : r.status === "pending_review"
      ? "review"
      : r.source === "paper" || r.source === "manual"
        ? "checked"
        : "automatic";
  return {
    receipt: toMobileReceipt(r),
    receiptNumber: r.receipt_number,
    merchantAddress: r.merchant_address,
    time: r.receipt_time,
    cardLastFour: r.card_last_four,
    items: (Array.isArray(r.items) ? r.items : [])
      .filter((i) => i && typeof i.label === "string" && typeof i.total_amount === "number")
      .map((i) => ({ label: i.label, qty: i.qty, unitAmount: i.unit_amount, total: i.total_amount })),
    subtotal: r.subtotal,
    tip: r.tip_amount != null && r.tip_amount > 0 ? r.tip_amount : null,
    vat,
    vatRate: r.tax_rate,
    vatLines: lines.map((l) => ({ rate: l.rate, vat: l.vat })),
    net: vat != null && r.total != null ? round2(r.total - vat) : null,
    fxDate: r.fx_source === "ecb" ? r.fx_date : null,
    paymentMethod: r.payment_method,
    transactionRef: r.transaction_ref,
    sellerOrgNumber: r.seller_org_number,
    merchantVatNumber: r.merchant_vat_number,
    stamp,
    pdfReady: r.status !== "pending_review",
  };
}
