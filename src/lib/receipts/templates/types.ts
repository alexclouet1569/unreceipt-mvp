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
};

export interface EmailTemplate {
  name: string;
  match(raw: EmailRaw): boolean;
  extract(raw: EmailRaw): PartialFields;
}

export interface SmsTemplate {
  name: string;
  match(raw: SmsRaw): boolean;
  extract(raw: SmsRaw): PartialFields;
}
