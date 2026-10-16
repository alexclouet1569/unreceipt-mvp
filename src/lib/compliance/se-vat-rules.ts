/**
 * Swedish VAT (moms) rules the receipt check applies, as dated config.
 * When a rule changes, edit the value, its validity dates, its `checkedOn`
 * date and its source here; src/lib/compliance/se-vat-check.ts reads only
 * this file.
 *
 * Every value was read on Skatteverket's own pages on `checkedOn`. The law
 * references name the chapter of mervärdesskattelagen (2023:200) only; the
 * exact paragraphs are for the accountant review to confirm.
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
  reverseCharge: {
    title: "Skatteverket — Omvänd betalningsskyldighet",
    url: "https://www.skatteverket.se/foretag/moms/sarskildamomsregler/omvandbetalningsskyldighet.4.47eb30f51122b1aaad28000258292.html",
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
   * deduction only when its total, VAT included, is at most this much:
   * "Du har nämligen inte rätt att dra av momsen i en förenklad faktura om
   * totalbeloppet i den överstiger 4 000 kronor inklusive moms."
   * Mervärdesskattelagen (2023:200) 17 kap. (invoiceRules)
   */
  simplifiedInvoiceMaxSek: { value: 4000, validFrom: "2023-07-01", law: "ML (2023:200) 17 kap." },

  /**
   * A förenklad faktura must show the issue date, the seller's VAT,
   * personal or organisation number, what was sold, and the VAT or the
   * details needed to work it out. The check looks at the seller id and
   * the VAT; date and goods are not checked. (invoiceRules)
   */
  simplifiedInvoiceChecked: ["sellerId", "vat"] as const,

  /**
   * A full invoice must show, among other things, the seller's VAT
   * registration number, the seller's and buyer's name and address, a
   * unique number, the taxable amount and VAT per rate. The check looks at
   * the seller VAT number, the buyer and the VAT; the rest is not checked.
   * (invoiceRules)
   */
  fullInvoiceChecked: ["sellerVatNumber", "buyerName", "buyerAddress", "vat"] as const,

  /**
   * Rates in force on `checkedOn`: 25 % standard, 12 % (e.g. restaurant
   * and café service), 6 % (e.g. food from 2026-04-01), 0 % for exempt
   * sales. 6 % was already a Swedish rate before the food change, so the
   * set needs no dates; the food window is recorded for a future
   * per-line rate check. ML (2023:200) 9 kap. (vatRates)
   */
  rates: [25, 12, 6, 0] as const,
  foodRate: { value: 6, validFrom: "2026-04-01", validTo: "2027-12-31", before: 12 },

  /**
   * "Du har aldrig rätt att göra avdrag för annat än svensk moms i
   * momsdeklarationen." VAT paid in another EU country may be reclaimed
   * from that country through Skatteverket's e-service, by 30 September of
   * the following year; minimum amounts and that country's own rules apply.
   * (foreignVat)
   */
  foreignVatRefundDeadline: "30 September the following year",
} as const;
