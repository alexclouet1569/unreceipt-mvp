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

  created_at: string;
  updated_at: string;
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
  current_period_end: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  // Per-user forwarding alias hash. NULL on rows created before step 6
  // (2026-05-12) — getOrCreateAliasForUser() backfills on first read.
  email_alias_hash: string | null;
  created_at: string;
  updated_at: string;
}
