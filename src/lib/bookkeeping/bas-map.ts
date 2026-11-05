// Bookkeeping account suggestions per receipt category, for the firm's
// bookkeeping.csv.
//
// SUGGESTIONS ONLY, TO BE CONFIRMED BY THE PILOT ACCOUNTANT (decision F6,
// 2026-11-04). Numbers follow the BAS chart of accounts (bas.se, "BAS
// kontoplan 2026", UNVERIFIED against the 2026 edition from this
// environment); names are the BAS group names. Where the deductibility of
// a purchase can't be known from the receipt alone, the group account is
// suggested rather than a specific "avdragsgill" account. A firm
// overrides them per receipt through receipts.bas_account, which always
// wins over this map. The README in every firm export repeats this caveat.
//
// Pure: no I/O.

import type { ReceiptCategory } from "@/lib/types";

export type BasSuggestion = {
  account: string;
  name: string;
  // False when the category's VAT is not deductible as ordinary input VAT
  // (representation): bookkeeping.csv then leaves the VAT account blank.
  inputVatDeductible: boolean;
};

export const BAS_BY_CATEGORY: Record<ReceiptCategory, BasSuggestion> = {
  // A meal on a receipt may be a travel meal (5830), staff cost (7690) or
  // the owner's private lunch; the travel group is the usual default for
  // an expense app, the accountant decides.
  meals: { account: "5830", name: "Kost och logi", inputVatDeductible: true },
  transport: { account: "5800", name: "Resekostnader", inputVatDeductible: true },
  travel: { account: "5800", name: "Resekostnader", inputVatDeductible: true },
  accommodation: { account: "5830", name: "Kost och logi", inputVatDeductible: true },
  office_supplies: { account: "6110", name: "Kontorsmateriel", inputVatDeductible: true },
  software: { account: "5420", name: "Programvaror", inputVatDeductible: true },
  // Representation meals are not deductible for income tax since 2017 and
  // VAT only on 300 kr/person: the non-deductible account, no VAT account,
  // the accountant splits it (src/lib/bookkeeping/rules.ts).
  client_entertainment: {
    account: "6072",
    name: "Representation, ej avdragsgill",
    inputVatDeductible: false,
  },
  other: { account: "6990", name: "Övriga externa kostnader", inputVatDeductible: true },
};

/** Input VAT (ingående moms). */
export const VAT_INPUT_ACCOUNT = "2640";

/**
 * The account to book a receipt on: the firm's own choice when set,
 * otherwise the category suggestion.
 */
export function basAccountFor(receipt: {
  category: ReceiptCategory;
  bas_account: string | null;
}): BasSuggestion {
  const own = receipt.bas_account?.trim();
  const suggested = BAS_BY_CATEGORY[receipt.category] ?? BAS_BY_CATEGORY.other;
  if (own) return { account: own, name: "", inputVatDeductible: suggested.inputVatDeductible };
  return suggested;
}
