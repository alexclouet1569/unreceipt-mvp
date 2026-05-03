/**
 * Database row types — keep aligned with `supabase/schema.sql`.
 *
 * These describe rows as Supabase returns them. Insert/update payloads
 * may omit defaults (id, created_at, updated_at) — narrow at the
 * call site rather than maintaining a parallel Insert/Update tree.
 */

export type ReceiptSource = "captured" | "forwarded" | "uploaded";

export interface Receipt {
  id: string;
  transaction_id: string;
  user_id: string;
  source: ReceiptSource;

  merchant_name: string | null;
  merchant_address: string | null;
  merchant_phone: string | null;
  merchant_vat_number: string | null;
  merchant_siret: string | null;

  receipt_number: string | null;
  receipt_date: string | null;
  receipt_time: string | null;

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

  verification_code: string | null;
  capture_time_seconds: number | null;
  ocr_confidence: number | null;
  is_verified: boolean;

  created_at: string;
  updated_at: string;
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
