// The JSON the native iPhone app (mobile/) reads from /api/mobile/*.
// Types only, no imports with code: mobile/ imports this file with
// `import type`, which disappears at build time, so the server and the app
// share one definition without the app ever bundling server code.

import type {
  ApprovalStatus,
  MailboxConnectionStatus,
  PaidBy,
  MailboxProviderId,
  ReceiptCategory,
  ReceiptSource,
  ReceiptStatus,
} from "@/lib/types";
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
  /**
   * Where the receipt sits in the home list's order (purchased_at, created_at,
   * id), as an opaque cursor: "Load more" asks for the receipts after the
   * last one shown, so nothing is skipped when the list changed meanwhile.
   */
  listKey?: string;
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
  /**
   * Approval inside a company (2026-11-15): set on an employee's receipt,
   * absent or null when no approval applies (an owner's). Missing on older
   * servers.
   */
  approval?: MobileApproval | null;
};

export type MobileApproval = {
  status: ApprovalStatus;
  /** Why it was sent back or rejected, as the approver wrote it. */
  comment: string | null;
  paidBy: PaidBy | null;
  /** An outlay the company has paid back. */
  reimbursed: boolean;
};

/**
 * The signed-in person's place in their company's team (2026-11-15), null
 * for someone working alone. `approvedBy`: who approves their receipts (an
 * employee's), shown as "Sent to …". `toApprove`: receipts waiting for
 * this person's decision (owners and approvers).
 */
export type MobileTeam = {
  role: "owner" | "approver" | "member";
  companyName: string;
  approvedBy: string | null;
  toApprove: number;
};

/** GET /api/team/approvals: one receipt waiting for the caller's decision. */
export type ApprovalQueueItem = {
  receipt: MobileReceipt;
  /** The employee's name or address. */
  employee: string;
  submittedAt: string | null;
};

/** GET /api/team/reimbursements: approved outlays not yet paid back, per employee. */
export type ReimbursementGroup = {
  userId: string;
  employee: string;
  currency: string;
  total: number;
  count: number;
  receiptIds: string[];
};

/**
 * GET /api/mobile/receipts/[id]: the digital receipt (DESIGN.md "Digital
 * receipt"), the paper copy the receipt screen shows next to the photo.
 * Display fields only, like MobileReceipt; amounts in the receipt's currency.
 */
export type MobileReceiptDetail = {
  receipt: MobileReceipt;
  receiptNumber: string | null;
  merchantAddress: string | null;
  /** As printed ("14:32"), null when unknown. */
  time: string | null;
  cardLastFour: string | null;
  items: { label: string; qty: number | null; unitAmount: number | null; total: number }[];
  subtotal: number | null;
  tip: number | null;
  vat: number | null;
  vatRate: number | null;
  /** Each VAT rate, only when there is more than one. */
  vatLines: { rate: number; vat: number }[];
  /** Total minus VAT, when the VAT is known. */
  net: number | null;
  /** The day of the ECB rate behind homeTotal (fxSource "ecb"). */
  fxDate: string | null;
  paymentMethod: string | null;
  transactionRef: string | null;
  sellerOrgNumber: string | null;
  merchantVatNumber: string | null;
  /**
   * The footer: verified by UnReceipt (then edited), waiting for review,
   * checked by the user (photo or typed in), or read automatically.
   */
  stamp: "verified" | "verified_edited" | "review" | "checked" | "automatic";
  /** False while the receipt waits for review: the PDF is refused then (409). */
  pdfReady: boolean;
};

/** The accounting firm the signed-in user works at (Clients tab), if any. */
export type MobileFirmRef = { name: string; role: "admin" | "staff" };

export type MobileHome =
  // Firm staff without a company: the app shows the Clients tab when `firm`
  // is set (a member), else a calm screen (a seat still to join on the web).
  | { state: "firm_only"; email: string; firm?: MobileFirmRef | null }
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
      /** Set when this user also works at an accounting firm: the Clients tab. */
      firm?: MobileFirmRef | null;
      /** Set when the user is part of a company team (approvals). */
      team?: MobileTeam | null;
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

// ── Analysis, formerly Insights (GET /api/mobile/analytics) ──────────────────────────────

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
  /** 0–1 of the period's total (absent from answers cached before 2026-11-19). */
  share?: number;
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
      /** The previous range in the same granularity, by position (for last period's bars beside or behind this one's). */
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

/** GET /api/mobile/receipts?after=<listKey>: the list's next page of older receipts ("Load more"). */
export type MobileReceiptsPage = { receipts: MobileReceipt[]; hasMore: boolean };

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
  confirmation: {
    code: string | null;
    forAddress: string | null;
    receivedAt: string;
    autoConfirmed?: boolean;
    // Gmail's own confirmation page (mail-settings.google.com/mail/vf-…):
    // Gmail's current email has this link and no code. Absent from older
    // servers. Only sent when forAddress is known.
    confirmUrl?: string | null;
    // Whether forAddress is one of the user's own addresses (null: unknown).
    // Anyone who knows the alias can make Gmail ask, so the guide warns
    // when it isn't.
    ownInbox?: boolean | null;
  } | null;
  lastEmailAt: string | null;
};

/**
 * One connected Gmail/Outlook mailbox (Account → Your email). Never the
 * token or the sync cursor. "needs_reconnect": the provider refused the
 * grant; connecting the same address again fixes it.
 */
export type MobileMailboxConnection = {
  id: string;
  provider: MailboxProviderId;
  email: string;
  status: MailboxConnectionStatus;
  lastReceiptAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
};

/**
 * GET /api/mobile/mailboxes (same body as GET /api/mailboxes): the user's
 * mailboxes, which providers can be connected right now, and the per-user
 * limit (a new address past it is refused).
 */
export type MobileMailboxes = {
  connections: MobileMailboxConnection[];
  providers: Record<MailboxProviderId, boolean>;
  limit: number;
};

/**
 * POST /api/mailboxes/claim { code }, with the code from
 * unreceipt://mailboxes?status=claim&code=<code>&provider=<id>.
 * 200 ok · 400/404 invalid (malformed, unknown or already used) · 410
 * expired · 403 wrong_account (the connect link was another account's) ·
 * 409 limit · 500 server_error. Every refusal after the code was read has
 * already revoked the grant: the user starts again from "Connect".
 */
export type MobileMailboxClaim =
  | { ok: true; connection: MobileMailboxConnection }
  | { error: "invalid" | "expired" | "wrong_account" | "server_error" }
  | { error: "limit"; limit: number };

/**
 * A receipt's original made viewable (GET /api/receipts/[id]/original?preview=1,
 * `preview`; website and iPhone app). Never the email's HTML: an email is
 * plain text cut from it on the server (src/lib/receipts/email-view.ts), and
 * a PDF is shown as one PNG per page from
 * GET /api/receipts/[id]/original/page/<n> (src/lib/receipts/pdf-render.ts).
 * A photo needs no preview: its `url` is the picture.
 */
export type OriginalPreview =
  | {
      type: "eml";
      from: string | null;
      to: string | null;
      subject: string | null;
      /** The Date header as written (its own time zone), null when missing. */
      date: string | null;
      text: string;
      /** Longer than the view's cap: the full message is in the file. */
      truncated: boolean;
    }
  | { type: "txt"; body: string; truncated: boolean }
  | {
      type: "pdf";
      /** The pages shown (at most 10), sizes in PDF points: width / height is the picture's shape. */
      pages: { width: number; height: number }[];
      /** Pages in the document (more than `pages.length` when it was cut). */
      total: number;
      /**
       * Only the /demo tour sets this (pictures drawn in the browser, blob:
       * URLs); the server leaves it out and the viewers load ./page/<n>.
       */
      images?: string[];
    }
  /** The file couldn't be read for a preview (a damaged or password-protected PDF). */
  | { type: "unavailable" };

/** GET /api/receipts/[id]/original: a 5-minute link to the file, and with ?preview=1 what to show. */
export type ReceiptOriginal = {
  url: string;
  kind: "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "eml" | "txt";
  filename: string;
  /** With ?preview=1: the same file sent as a download (Content-Disposition: attachment). */
  downloadUrl?: string;
  preview?: OriginalPreview;
};

/**
 * GET /api/receipts/updates?after=<created_at>&rows=mobile — "anything
 * new?", asked every ~20 s while the app is in the foreground. Reload the
 * list when `version` differs from the last one; `fresh` are the email
 * receipts that arrived after `after` (newest first, at most 20), with
 * their rows in `receipts` (absent without access).
 */
export type MobileReceiptUpdates = {
  version: string;
  latestCreatedAt: string | null;
  fresh: { id: string; createdAt: string }[];
  receipts?: MobileReceipt[];
};

/** One client company on the Clients tab, with this month's counts. */
export type MobileFirmClient = {
  organizationId: string;
  name: string;
  orgNumber: string | null;
  /** Receipts the firm may see, printed in the month (mailbox ones only once confirmed). */
  total: number;
  reviewNeeded: number;
  ready: number;
  exported: number;
  /** Arrived in the last 7 days. */
  newThisWeek: number;
  lastReceiptAt: string | null;
};

/**
 * GET /api/mobile/firm?month=YYYY-MM — the Clients tab: the firm, its
 * clients with the month's counts, invites still waiting, and the firm's
 * join link with its QR code (a PNG data URL; null when off or unreadable).
 */
export type MobileFirmHome = {
  firmName: string;
  role: "admin" | "staff";
  month: string;
  clients: MobileFirmClient[];
  pending: { id: string; name: string; email: string; invitedAt: string; expired: boolean }[];
  /**
   * `recommend`: a ready Swedish email for the firm's clients with this link
   * (src/lib/firm/recommend.ts), shared as is whatever the app's language.
   */
  joinLink: { url: string; qr: string | null; recommend?: { subject: string; body: string } } | null;
};

/**
 * GET /api/mobile/firm/clients/<orgId>?month=YYYY-MM — one client's month
 * on the Clients tab: its receipts the firm may see (newest first, at most
 * 500), and its reminder state. 404 when the client isn't this firm's.
 */
export type MobileFirmClientMonth = {
  organizationId: string;
  clientName: string;
  month: string;
  receipts: MobileReceipt[];
  reminders: { weekly: boolean; clientOptedOut: boolean; lastSentAt: string | null };
};
