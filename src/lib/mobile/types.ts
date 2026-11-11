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

/** One line of "Your accountant" (GET /api/mobile/account). */
export type MobileAccountantLink = {
  id: string;
  /** invited: a firm asked this user. sent: the company asked an accountant. active: the firm sees the receipts. */
  status: "invited" | "active" | "sent";
  /** The firm's name; for "sent", the address the invite went to. */
  name: string;
  /** When the link started (ISO), active links only. */
  since: string | null;
  /** The firm's Monday reminder email (active links): the company's own choice and the firm's switch. */
  reminders: { optedOut: boolean; firmOn: boolean } | null;
};

/** What deleting the account does to the accounting firm the user works in. */
export type MobileFirmExit =
  | { kind: "stays"; firmName: string }
  | { kind: "handover"; firmName: string; successorEmail: string }
  | { kind: "close"; firmName: string; activeClients: number };

/** The Account tab (GET /api/mobile/account). No plan, price or usage (App Store 3.1.3(f)). */
export type MobileAccount = {
  email: string;
  /** False for accounting-firm staff without a company of their own. */
  hasCompany: boolean;
  /** The company's currency; only an owner may change it. */
  currency: { value: string; options: string[]; canChange: boolean } | null;
  accountant: MobileAccountantLink[];
  /** The earliest month with a receipt ("2025-03"), for the export's month list. */
  firstMonth: string | null;
  /** null: not in a firm. "unknown": couldn't be checked, so deleting waits. */
  firmExit: MobileFirmExit | "unknown" | null;
};

/** POST /api/export, as the app reads it. */
export type MobileExport = {
  receiptCount: number;
  /** Originals that couldn't be added to the ZIP. */
  missing: number;
  parts: { filename: string; url: string; bytes: number }[];
};

/** A button or menu name in the user's mail app, in its three languages. */
export type MobileMailLabel = { en: string; sv: string; fr: string };

/** The forwarding setup guide (GET /api/mobile/forwarding). */
export type MobileForwarding = {
  address: string | null;
  /** From the sign-in email's domain; the guide starts there. */
  suggested: "gmail" | "outlook" | "icloud" | "paid" | null;
  /** The user's own inboxes: receipts sent to them can be trusted (Uber, Stripe). */
  ownAddresses: { signIn: string; extra: string[]; max: number };
  /** Button names, from the website's guide (src/app/app/(authed)/settings/forwarding/guide/ui-labels.ts). */
  labels: {
    gmail: Record<string, MobileMailLabel>;
    outlook: Record<string, MobileMailLabel>;
    icloud: Record<string, MobileMailLabel>;
    phone: Record<string, MobileMailLabel>;
  };
  /** What to paste in Gmail's "Has the words". */
  gmailFilter: string;
  outlookWords: string[];
  icloudWords: { en: string[]; sv: string[]; fr: string[] };
  /** Every subject word, for other providers. */
  allWords: string[];
  links: {
    gmailForwarding: string;
    gmailFilters: string;
    outlookPersonal: string;
    outlookWork: string;
    icloud: string;
  };
};

/** GET /api/forwarding/status, as the guide polls it. */
export type MobileForwardingStatus = {
  confirmation: { code: string | null; forAddress: string | null; receivedAt: string; autoConfirmed?: boolean } | null;
  lastEmailAt: string | null;
};
