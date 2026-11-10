// The JSON the native iPhone app (mobile/) reads from /api/mobile/*.
// Types only, no imports with code: mobile/ imports this file with
// `import type`, which disappears at build time, so the server and the app
// share one definition without the app ever bundling server code.

import type { ReceiptCategory, ReceiptSource, ReceiptStatus } from "@/lib/types";
import type { RequiredField } from "@/lib/receipts/status";

export type MobileReceipt = {
  id: string;
  /** "pending_review" with an empty `missing` = filled in, waiting for a confirmation. */
  status: ReceiptStatus;
  missing: RequiredField[];
  source: ReceiptSource;
  merchant: string | null;
  category: ReceiptCategory;
  /** The receipt's own currency and amount. */
  currency: string;
  total: number | null;
  /** In the company's currency; fxSource "ecb" = estimate, "manual" = from the bank statement. */
  homeCurrency: string | null;
  homeTotal: number | null;
  fxSource: "same" | "ecb" | "manual" | null;
  /** ISO timestamp (purchased_at) or plain date (receipt_date), null when unknown. */
  date: string | null;
  createdAt: string;
  /**
   * What the receipt was made from, for the detail screen:
   * "image" or "pdf" (a photo or scan, shown from GET
   * /api/receipts/[id]/original), "email" or "text" (a forwarded message),
   * null when there is none.
   */
  original: "image" | "pdf" | "email" | "text" | null;
  /** The user's own note, without the sentences the server writes. */
  notes: string | null;
  /** Same merchant, amount and day as another receipt (shown translated). */
  possibleDuplicate: boolean;
  exportedAt: string | null;
  bookedAt: string | null;
};

export type MobileHome =
  // Firm staff without a company: the app tells them to use the web portal.
  | { state: "firm_only"; email: string }
  // No active plan. The app shows a neutral screen: no price, no link
  // (App Store 3.1.3(f), AGENTS.md → Store apps).
  | { state: "inactive"; email: string }
  | {
      state: "ready";
      email: string;
      access: "active" | "pilot" | "db_warning";
      homeCurrency: string;
      forwardingEmail: string;
      showOnboarding: boolean;
      accountantInvites: { id: string; firmName: string }[];
      receipts: MobileReceipt[];
    };
