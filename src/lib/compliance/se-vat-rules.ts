/**
 * Swedish VAT (moms) rules the receipt check applies, as dated config.
 * When a rule changes, edit the value, its `checkedOn` date and its
 * source here; src/lib/compliance/se-vat-check.ts reads only this file.
 *
 * Every value was read on Skatteverket's own pages on `checkedOn`.
 * Not yet reviewed by an accountant (launch plan action 11):
 * `reviewedByAccountant` stays false until someone has, and the UI says the
 * check is not tax advice either way.
 *
 * Pure data, safe to import anywhere.
 */

export type RuleSource = { title: string; url: string; checkedOn: string };

export const SE_VAT_SOURCES = {
  invoiceRules: {
    title: "Skatteverket — Momslagens regler om fakturering",
    url: "https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momslagensregleromfakturering.4.58d555751259e4d66168000403.html",
    checkedOn: "2026-10-16",
  },
  vatRates: {
    title: "Skatteverket — Momssatser och undantag från moms",
    url: "https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momssatserochundantagfranmoms.4.58d555751259e4d66168000409.html",
    checkedOn: "2026-10-16",
  },
  foreignVat: {
    title: "Skatteverket — Återbetalning av utländsk moms",
    url: "https://www.skatteverket.se/foretag/moms/sarskildamomsregler/handelmedandralander/aterbetalningavutlandskmoms.4.58d555751259e4d661680001107.html",
    checkedOn: "2026-10-16",
  },
} satisfies Record<string, RuleSource>;

export const SE_VAT_RULES = {
  reviewedByAccountant: false,

  /**
   * A förenklad faktura (e.g. a till receipt) is enough for the VAT
   * deduction only when its total, VAT included, is at most this much.
   * Above it the buyer needs a full invoice: "Du har nämligen inte rätt att
   * dra av momsen i en förenklad faktura om totalbeloppet i den överstiger
   * 4 000 kronor inklusive moms." (invoiceRules)
   */
  simplifiedInvoiceMaxSek: 4000,

  /**
   * A förenklad faktura must show, besides the date and what was sold:
   * the seller's VAT, personal or organisation number, and the VAT or the
   * details needed to work it out. (invoiceRules)
   */
  simplifiedInvoiceNeeds: ["sellerId", "vat"] as const,

  /**
   * A full invoice must also show the seller's VAT registration number and
   * the seller's and buyer's name and address. The check looks at the
   * parts a till receipt typically lacks. (invoiceRules)
   */
  fullInvoiceNeeds: ["sellerVatNumber", "buyerName", "buyerAddress"] as const,

  /**
   * Rates in force on `checkedOn`: 25 % standard, 12 % (restaurant and
   * café service, hotel stays), 6 % (food from 2026-04-01, books, passenger
   * transport), 0 % for exempt sales. (vatRates) The food rate moved from
   * 12 % to 6 % on 2026-04-01; both are in the set, so the change needs no
   * date logic here.
   */
  rates: [25, 12, 6, 0] as const,

  /**
   * "Du har aldrig rätt att göra avdrag för annat än svensk moms i
   * momsdeklarationen." VAT paid in another EU country can be reclaimed
   * there via Skatteverket's e-service, by 30 September of the following
   * year. (foreignVat)
   */
  foreignVatRefundDeadline: "30 September the year after",
} as const;
