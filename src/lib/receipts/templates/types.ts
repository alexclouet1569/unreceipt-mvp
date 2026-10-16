// Shared types for the email + SMS template extractors.

import type { EmailRaw, SmsRaw } from "@/lib/receipts/parser-types";

export type PartialFields = {
  merchant_name?: string;
  purchased_at?: string; // ISO timestamp
  total?: number;
  currency?: string;
  subtotal?: number;
  tax_amount?: number;
  tax_rate?: number;
  payment_method?: string;
  card_last_four?: string;
  notes?: string;
  items?: PartialItem[];
};

export type PartialItem = {
  label: string;
  qty: number | null;
  unit_amount: number | null;
  total_amount: number;
};

export interface EmailTemplate {
  name: string;
  // Sender domains whose authenticated mail (DMARC pass) is trusted on a
  // full template hit. Anything else that matches (subject look-alikes, a
  // manual "Fwd:") is extracted but lands in Review needed.
  trustedDomains: readonly string[];
  match(raw: EmailRaw): boolean;
  extract(raw: EmailRaw): PartialFields;
}

export interface SmsTemplate {
  name: string;
  match(raw: SmsRaw): boolean;
  extract(raw: SmsRaw): PartialFields;
}
