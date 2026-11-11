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
      /**
       * Everything beyond `receipts` (the newest 50), summed on the server,
       * so counts and totals stay right for any number of receipts. The
       * screens add what they compute from their own list (which already
       * shows the phone's changes) to this. Missing on servers before
       * 2026-11-11: treat as empty.
       */
      older?: OlderSummary;
    };

/**
 * A sum in one currency. `estimate`: it includes an ECB-rate conversion
 * (shown with "≈"). Lists put the company's currency first, then foreign
 * amounts that couldn't be converted yet (never added in).
 */
export type MoneyLine = { amount: number; currency: string; estimate: boolean };

/** Receipts not in the home list, summed. Months are purchase months in Europe/Stockholm. */
export type OlderSummary = {
  count: number;
  verified: number;
  toConfirm: number;
  /** "2026-03" → that month's total. */
  months: Record<string, MoneyLine[]>;
  /** Every receipt, dated or not. */
  all: MoneyLine[];
};

// ── Insights (GET /api/mobile/analytics) ──────────────────────────────

export type AnalyticsPeriodKind = "month" | "quarter" | "year" | "custom";
export type AnalyticsGranularity = "day" | "week" | "month";
/** Calendar days, inclusive. */
export type AnalyticsRange = { from: string; to: string };

/** One bar: the spend of its days in the company's currency. */
export type AnalyticsBucket = { from: string; to: string; amount: number; count: number };

export type AnalyticsCategory = {
  category: ReceiptCategory;
  amount: number;
  count: number;
  /** 0–1 of the period's total. */
  share: number;
  /** The same category in the previous period; null when there is nothing to compare with. */
  previous: number | null;
};

export type AnalyticsMerchant = {
  /** Normalised name, for the drill-down. */
  key: string;
  name: string;
  amount: number;
  count: number;
  previous: number | null;
};

/**
 * The VAT printed on the period's receipts: what the receipts say, never a
 * VAT return and never a claim of what can be deducted (that depends on
 * the company's VAT registration and on what each purchase was for; the
 * accountant decides).
 */
export type AnalyticsVat = {
  /**
   * "se": a Swedish company in kronor: Swedish rates are told apart.
   * "other": VAT as printed only; no rules for its country in the app yet.
   */
  mode: "se" | "other";
  /** VAT on receipts in the company's currency. */
  total: number;
  /** Per rate; `rate` null when it couldn't be read, `net` null when unknown. */
  rates: { rate: number | null; net: number | null; vat: number }[];
  /** "se": VAT at Swedish rates (25, 12, 6 %) on confirmed receipts, client entertainment apart. */
  swedish: number | null;
  /** "se": VAT on client entertainment (representation), whose deduction is limited. */
  representation: number | null;
  /** "se": VAT that needs a look first: receipts not confirmed yet, or a rate that isn't Swedish or couldn't be read. */
  toCheck: { amount: number; count: number } | null;
  /** Receipts in the company's currency with no VAT recorded. */
  withoutVat: number;
  /** Receipts in another currency: their VAT isn't counted. */
  foreign: number;
};

export type AnalyticsInsight =
  /** A category well above its usual level. */
  | { kind: "category_up"; category: ReceiptCategory; amount: number; baseline: number; pct: number }
  /** The same merchant, about the same amount, month after month. */
  | { kind: "recurring"; merchant: string; name: string; amount: number; months: number; ids: string[] }
  /** A merchant never seen before this period, with a large spend. */
  | { kind: "new_merchant"; merchant: string; name: string; amount: number; ids: string[] }
  /** The period's largest purchase. */
  | { kind: "largest"; name: string; amount: number; share: number; ids: string[] }
  /** Receipts marked as possible duplicates. */
  | { kind: "duplicates"; count: number; ids: string[] }
  /** Client entertainment (Swedish companies): its VAT deduction is limited, the accountant decides. */
  | { kind: "representation"; amount: number; vat: number; ids: string[] };

export type MobileAnalytics =
  | { state: "firm_only" }
  | { state: "inactive" }
  | {
      state: "ready";
      currency: string;
      period: {
        kind: AnalyticsPeriodKind;
        key: string;
        from: string;
        to: string;
        previous: AnalyticsRange;
        lastYear: AnalyticsRange;
        /** Today falls inside it (the bars after today are the future). */
        current: boolean;
      };
      /** Today in Europe/Stockholm. */
      today: string;
      /** The earliest purchase day of any receipt; null without dated receipts. */
      firstDay: string | null;
      total: {
        amount: number;
        estimate: boolean;
        count: number;
        /** Receipts waiting for a confirmation, included in the total. */
        toConfirm: number;
        /** Foreign receipts not converted yet: listed apart, not in `amount`. */
        unconverted: MoneyLine[];
      };
      /** Totals of the comparison ranges; null when the user had no receipts yet then. */
      compare: { previous: number | null; lastYear: number | null };
      granularity: AnalyticsGranularity;
      buckets: AnalyticsBucket[];
      /** The previous range in the same granularity, by position (for the ghost bars and the pace line). */
      previousBuckets: number[];
      categories: AnalyticsCategory[];
      merchants: AnalyticsMerchant[];
      vat: AnalyticsVat;
      /** At most three, most useful first. */
      insights: AnalyticsInsight[];
      quality: {
        /** In the period: amount missing (not in the total). */
        missingAmount: number;
        /** In the period: merchant, amount or date missing. */
        toComplete: number;
        /** In the period: foreign, not converted yet. */
        unconverted: number;
        /** All time: no purchase date, so in no period. */
        undated: number;
      };
    };

/** GET /api/mobile/analytics/receipts: the receipts behind a number. */
export type MobileAnalyticsReceipts = { receipts: MobileReceipt[]; truncated: boolean };

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
