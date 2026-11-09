/**
 * Database row types — keep aligned with `supabase/schema.sql`.
 *
 * These describe rows as Supabase returns them. Insert/update payloads
 * may omit defaults (id, created_at, updated_at) — narrow at the
 * call site rather than maintaining a parallel Insert/Update tree.
 */

// Canonical intake source — every receipt that lands in the app comes
// from one of these four paths. See plan step 3 + supabase/schema.sql
// "digital-receipt canonicalization" section.
export type ReceiptSource = "email" | "sms" | "paper" | "manual";

export type ReceiptOriginalKind =
  | "eml"
  | "txt"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

// 'verified' is the trustworthy default — all required fields filled and
// parser confidence high enough to download as PDF. 'pending_review'
// rows surface in the "Review needed" slice on /app until the user
// completes them. See src/lib/receipts/status.ts for the rule.
export type ReceiptStatus = "verified" | "pending_review";

export type ReceiptCategory =
  | "meals"
  | "transport"
  | "accommodation"
  | "office_supplies"
  | "software"
  | "client_entertainment"
  | "travel"
  | "other";

export interface Receipt {
  id: string;
  // Nullable since the WOZ admin/concierge slice — forwarded-email receipts
  // have no bank transaction. Self-service rows still set this.
  transaction_id: string | null;
  user_id: string;
  source: ReceiptSource;

  merchant_name: string | null;
  merchant_address: string | null;
  merchant_phone: string | null;
  merchant_vat_number: string | null;
  merchant_siret: string | null;

  category: ReceiptCategory;
  currency: string;
  notes: string | null;

  receipt_number: string | null;
  // Legacy DATE + TIME — populated by the WOZ admin paste form. New code
  // should prefer purchased_at (set by the intake parser in steps 5–7).
  receipt_date: string | null;
  receipt_time: string | null;
  // Canonical purchase timestamp. NULL on rows created before step 3.
  purchased_at: string | null;

  subtotal: number | null;
  tax_amount: number | null;
  tax_rate: number | null;
  tip_amount: number | null;
  total: number | null;

  payment_method: string | null;
  card_last_four: string | null;
  transaction_ref: string | null;

  image_url: string | null;
  image_captured_at: string | null;

  // Trust slice. 'pending_review' rows are hidden from PDF download and
  // surfaced in the "Review needed" filter on /app. See plan step 9.
  status: ReceiptStatus;

  verification_code: string | null;
  capture_time_seconds: number | null;
  // Raw-OCR confidence (0-100), populated by the Claude-vision step. Only
  // meaningful for source='paper'. See `parse_confidence` for the cross-
  // intake-path signal.
  ocr_confidence: number | null;
  is_verified: boolean;

  // Intake-path metadata (added in plan step 3). Populated by the email /
  // SMS / paper intake handlers in steps 5–7.
  original_source_url: string | null;
  original_source_kind: ReceiptOriginalKind | null;
  // Idempotency key — email Message-Id, Twilio MessageSid, or sha256 of
  // a paper upload. Re-forwarding the same email is a no-op.
  intake_ref: string | null;
  // 0..1 parser confidence. Distinct from ocr_confidence — covers regex
  // match quality and LLM schema-validation pass-rate too, so it applies
  // to email/SMS intake where there is no OCR step.
  parse_confidence: number | null;

  // Line items as a JSON array. Optional — many receipts (Uber rides,
  // Stripe SaaS subscriptions) have no per-line breakdown. When the
  // parser can pull individual items off a paper supermarket receipt
  // or a Stripe line-itemed invoice they go here.
  items: ReceiptItem[] | null;

  // Customer corrections (launch plan 41–42). Set by PATCH only, when a
  // factual field changes. See src/lib/receipts/edits.ts.
  edited_at: string | null;
  edited_fields: string[] | null;
  edit_history: EditHistoryEntry[] | null;

  // Which company the receipt belongs to (2026-11-04). Set on insert from the
  // owner's default organisation; the firm portal filters on it. Null only on
  // rows older than the backfill.
  organization_id: string | null;

  // Bookkeeping facts for the accountant (2026-11-04). vat_lines holds the
  // VAT split per rate; bas_account the account the firm chose (overrides the
  // category suggestion in src/lib/bookkeeping/bas-map.ts).
  seller_org_number: string | null;
  vat_lines: VatLine[] | null;
  bas_account: string | null;
  // Set once by the first export that included the receipt (firm export
  // with markExported); never moved by a re-export.
  exported_at: string | null;
  exported_by: string | null;
  // Set by the firm when the receipt is booked in their system.
  booked_at: string | null;
  booked_by: string | null;
  booked_ref: string | null;

  // Amount in the organisation's home currency (2026-11-05). `total` stays
  // the amount on the receipt. fx_source: 'same' (no conversion), 'ecb'
  // (ECB reference rate of fx_date) or 'manual' (typed from the bank
  // statement). All null until converted; see src/lib/fx.ts.
  home_currency: string | null;
  home_total: number | null;
  fx_rate: number | null;
  fx_date: string | null;
  fx_source: "same" | "ecb" | "manual" | null;

  created_at: string;
  /**
   * Moves on every UPDATE (receipts_set_updated_at, 2026-11-08 block;
   * production had an equivalent hand-made trigger before). Not an audit
   * trail: use edited_at / edit_history for what changed and when.
   */
  updated_at: string;
}

export interface EditChange {
  from: unknown;
  to: unknown;
}

export interface EditHistoryEntry {
  // ISO timestamp of the save.
  at: string;
  // auth user id of whoever saved it (absent on entries written before
  // 2026-10-15's review fix).
  by?: string;
  // Column name → value before and after, for each tracked field changed.
  changes: Record<string, EditChange>;
}

export interface ReceiptItem {
  // The line label as it appears on the original receipt — e.g.
  // "Red Bull 250ml", "Tomater Cherry 250g".
  label: string;
  // Item quantity. Often "1" for SKU-style items; can be 0.5, 2.5, etc.
  // for weight-priced items. Null when the original receipt doesn't
  // break it out.
  qty: number | null;
  // Per-unit price. Null when only the line total is shown.
  unit_amount: number | null;
  // The line total (qty * unit, including any line-specific tax). This
  // is the only field guaranteed to be present.
  total_amount: number;
}

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid";

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  // Plan id from src/lib/plans.ts ("light" | "regular" | "heavy"); null on
  // rows written before plans existed.
  plan: string | null;
  // True when the subscription carries the metered extra-receipt price.
  overage_enabled: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}

// One row per receipt ever created (public.receipt_usage). Not deleted with
// the receipt, so the plan allowance can't be reset by deleting.
export interface ReceiptUsage {
  receipt_id: string;
  user_id: string;
  source: string;
  created_at: string;
  overage_billed_at: string | null;
}

export interface Profile {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  // Per-user forwarding alias hash. NULL on rows created before step 6
  // (2026-05-12) — getOrCreateAliasForUser() backfills on first read.
  email_alias_hash: string | null;
  // Set once the pilot welcome email has gone out, so it's sent only once.
  welcome_email_sent_at: string | null;
  // Set when the first-run onboarding on /app is finished or skipped.
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

// Latest Gmail forwarding confirmation code sent to a user's alias
// (public.email_forwarding_confirmations), shown in the forwarding guide.
export interface EmailForwardingConfirmation {
  user_id: string;
  provider: "gmail";
  code: string | null;
  for_address: string | null;
  received_at: string;
  // Set when /api/intake/email confirmed the request itself (2026-11-08).
  auto_confirmed_at: string | null;
}

// An address the user declared as their own (public.user_email_addresses):
// receipts originally sent to it can be trusted automatically.
export interface UserEmailAddress {
  user_id: string;
  address: string;
  created_at: string;
}

// ─── Accounting-firm portal (2026-11-04) ─────────────────────────────────────

// A client company. Every user has one default organisation
// (default_for_user_id = that user), minted lazily by
// getOrCreateDefaultOrganization() and backfilled by the migration.
export interface Organization {
  id: string;
  name: string;
  // ISO 3166-1 alpha-2, e.g. "SE".
  country: string;
  // ISO 4217 home currency: totals and exports are in it (2026-11-05).
  currency: string;
  org_number: string | null;
  default_for_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MembershipRole = "owner" | "member";

export interface Membership {
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  created_at: string;
}

// An accounting firm (redovisningsbyrå) using /firm.
export interface Firm {
  id: string;
  name: string;
  org_number: string | null;
  country: string;
  created_at: string;
  updated_at: string;
}

export type FirmMemberRole = "admin" | "staff";

// Firm staff. user_id is null until the invited address signs in and
// claims the row (requireFirmMember() does that on first confirmed sign-in).
export interface FirmMember {
  id: string;
  firm_id: string;
  user_id: string | null;
  // Lowercased.
  email: string;
  role: FirmMemberRole;
  invited_by: string | null;
  claimed_at: string | null;
  created_at: string;
}

export type FirmClientStatus = "invited" | "active" | "revoked";

// Who sent the invite: the firm (to a client's address) or the client
// company (to its accountant's address). 2026-11-05.
export type FirmClientDirection = "firm" | "client";

// Firm ↔ client company link, one active firm per organisation.
// direction 'firm': firm_id set, organization_id null until the client
// accepts. direction 'client': organization_id set, firm_id null until the
// accountant accepts. invited_email is always the address that must accept.
export interface FirmClient {
  id: string;
  firm_id: string | null;
  organization_id: string | null;
  direction: FirmClientDirection;
  status: FirmClientStatus;
  client_name: string;
  client_org_number: string | null;
  // Lowercased.
  invited_email: string;
  // sha256 of the invite link token; null once used or revoked.
  invite_token_hash: string | null;
  invite_expires_at: string | null;
  invited_by: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  // Monday email to the client's owners (2026-11-09): the firm's switch,
  // and the client's own opt-out (only the client sets it).
  weekly_reminder: boolean;
  reminders_opted_out_at: string | null;
}

// One reminder email run to a client company (2026-11-09).
export interface ClientReminder {
  id: string;
  organization_id: string;
  firm_id: string | null;
  kind: "weekly" | "manual";
  week: string | null;
  missing_count: number;
  review_count: number;
  recipients: number;
  sent_at: string;
}

// A line of a client company's bank statement, imported by its accounting
// firm (2026-11-08). Whether it has a receipt is computed on read
// (src/lib/bank/match.ts); only the firm's decisions are stored.
export interface BankTransaction {
  id: string;
  organization_id: string;
  // YYYY-MM-DD.
  booked_on: string;
  // Negative = money out. Postgres numeric may arrive as a string.
  amount: number;
  currency: string;
  description: string;
  linked_receipt_id: string | null;
  no_receipt_reason: "bank_fee" | "transfer" | "tax" | "salary" | "loan" | "invoice_elsewhere" | "other" | null;
  decided_by: string | null;
  decided_at: string | null;
  reminded_at: string | null;
  imported_by: string | null;
  imported_at: string;
}

// VAT split per rate, stored on receipts.vat_lines as a JSON array (like
// items). `net` is null when the receipt shows only the VAT amount.
export interface VatLine {
  // Percent, e.g. 25, 12, 6 or 0.
  rate: number;
  net: number | null;
  vat: number;
}
