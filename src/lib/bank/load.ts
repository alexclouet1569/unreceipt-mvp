// SERVER-ONLY. Loads one client company's bank lines and receipts around a
// month and matches them (src/lib/bank/month.ts). Called by the firm's
// client page and the reminder route, always with an organisation id that
// came from requireFirmClientAccess().

import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ensureHomeAmounts } from "@/lib/fx";
import type { BankTransaction, Receipt } from "@/lib/types";
import { bankWindow, buildBankMonth, type BankMonthView } from "./month";

const MAX_LINES = 5000;
const MAX_RECEIPTS = 3000;

/** Null when the lines couldn't be read (the page then says so). */
export async function loadBankMonth(
  organizationId: string,
  month: string,
  homeCurrency: string
): Promise<BankMonthView | null> {
  const db = getSupabaseAdmin();
  const w = bankWindow(month);
  try {
    const lines = await db
      .from("bank_transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .gte("booked_on", w.txFrom)
      .lte("booked_on", w.txTo)
      .order("booked_on", { ascending: true })
      .limit(MAX_LINES);
    if (lines.error) throw new Error(`bank lines read failed (${lines.error.code})`);
    const transactions = (lines.data ?? []) as BankTransaction[];
    if (transactions.length === 0) return buildBankMonth([], [], month);

    // A receipt's day is its printed date, else its purchase time: the
    // timestamps get a day of slack each side for the Stockholm day.
    const tsFrom = new Date(Date.parse(`${w.receiptFrom}T00:00:00Z`) - 86_400_000).toISOString();
    const tsTo = new Date(Date.parse(`${w.receiptTo}T00:00:00Z`) + 2 * 86_400_000).toISOString();
    const receipts = await db
      .from("receipts")
      .select("*")
      .eq("organization_id", organizationId)
      .or(
        `and(receipt_date.gte.${w.receiptFrom},receipt_date.lte.${w.receiptTo}),` +
          `and(receipt_date.is.null,purchased_at.gte.${tsFrom},purchased_at.lt.${tsTo})`
      )
      .limit(MAX_RECEIPTS);
    if (receipts.error) throw new Error(`receipts read failed (${receipts.error.code})`);
    const loaded = (receipts.data ?? []) as Receipt[];
    // Foreign receipts need their amount in the bank's currency to match.
    const converted = await ensureHomeAmounts(loaded, homeCurrency).catch((err) => {
      console.error("[bank] currency conversion failed", err);
      return loaded;
    });
    return buildBankMonth(transactions, converted, month);
  } catch (err) {
    console.error("[bank] load failed", err);
    Sentry.captureException(err, { tags: { area: "bank-month" } });
    return null;
  }
}
