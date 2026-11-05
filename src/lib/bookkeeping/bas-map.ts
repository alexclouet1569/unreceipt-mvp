// Bookkeeping account suggestions per receipt category, for the firm's
// bookkeeping.csv. BAS 2026 chart of accounts (Swedish standard).
//
// TO BE CONFIRMED BY THE PILOT ACCOUNTANT (decision F6, 2026-11-04): these
// are standard defaults; firms differ. A firm overrides them per receipt
// through receipts.bas_account, which always wins over this map.
//
// Pure: no I/O.

import type { ReceiptCategory } from "@/lib/types";

export type BasSuggestion = {
  account: string;
  name: string;
};

export const BAS_BY_CATEGORY: Record<ReceiptCategory, BasSuggestion> = {
  // Meals while working/travelling (not representation): 5800-series travel
  // or 7690 staff costs depending on the firm; 5800 is the common default.
  meals: { account: "5800", name: "Resekostnader (måltid)" },
  transport: { account: "5800", name: "Resekostnader" },
  travel: { account: "5800", name: "Resekostnader" },
  accommodation: { account: "5830", name: "Logi" },
  office_supplies: { account: "6110", name: "Kontorsmateriel" },
  software: { account: "5420", name: "Programvaror" },
  // Representation: 6071 is the deductible part, 6072 the non-deductible;
  // the split depends on the rules in src/lib (planned), so the suggestion
  // names the deductible account and leaves the split to the accountant.
  client_entertainment: { account: "6071", name: "Representation, avdragsgill" },
  other: { account: "6991", name: "Övriga externa kostnader, avdragsgilla" },
};

/** Input VAT (ingående moms). */
export const VAT_INPUT_ACCOUNT = "2640";

/** Swedish VAT rates in percent, highest first. */
export const SWEDISH_VAT_RATES = [25, 12, 6, 0] as const;

/**
 * The account to book a receipt on: the firm's own choice when set,
 * otherwise the category suggestion.
 */
export function basAccountFor(receipt: {
  category: ReceiptCategory;
  bas_account: string | null;
}): BasSuggestion {
  const own = receipt.bas_account?.trim();
  if (own) return { account: own, name: "" };
  return BAS_BY_CATEGORY[receipt.category] ?? BAS_BY_CATEGORY.other;
}
