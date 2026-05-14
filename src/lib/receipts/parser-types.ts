// Public input/output types for the canonical-field extractor. Split
// from parser.ts so template modules can depend on the types without
// importing the LLM-bearing dispatcher (which would pull the Anthropic
// SDK into client-side bundles if anyone forgets the SERVER-ONLY
// boundary).

export type ParseInput =
  | { kind: "email"; raw: EmailRaw }
  | { kind: "sms"; raw: SmsRaw }
  | { kind: "paper"; raw: PaperRaw };

export type EmailRaw = {
  from: string;
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
};

export type SmsRaw = {
  from: string;
  body: string;
};

export type PaperRaw = {
  ocrText: string;
};

export type CanonicalReceiptFields = {
  merchant_name: string;
  purchased_at: string; // ISO timestamp
  total: number;
  currency: string;
  subtotal?: number | null;
  tax_amount?: number | null;
  tax_rate?: number | null;
  category?: string | null;
  payment_method?: string | null;
  card_last_four?: string | null;
  notes?: string | null;
  // Line items lifted off the original receipt. Optional — many
  // receipts (Uber, SaaS subscriptions) have no per-line breakdown.
  items?: ParsedReceiptItem[] | null;
  parse_confidence: number;
};

export type ParsedReceiptItem = {
  label: string;
  qty: number | null;
  unit_amount: number | null;
  total_amount: number;
};

export type ParseResult =
  | { status: "ok"; fields: CanonicalReceiptFields }
  | { status: "pending_review" };
