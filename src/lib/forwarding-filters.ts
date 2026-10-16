// Subject words for the automatic forwarding rules in the setup guide
// (/app/settings/forwarding). Rules match on the subject, not the body, so
// newsletters that merely mention "your order" stay out. English, Swedish
// and French, because that's what our customers' receipts are written in.
// Anything a rule lets through that isn't a receipt lands in "Review
// needed" and costs nothing until the user confirms it.

export const RECEIPT_SUBJECT_WORDS = [
  "receipt",
  "kvitto",
  "reçu",
  "order confirmation",
  "orderbekräftelse",
  "confirmation de commande",
  "booking confirmation",
  "bokningsbekräftelse",
  "confirmation de réservation",
  "invoice",
  "faktura",
  "facture",
] as const;

// Gmail's "Has the words" field: subject:(a OR "b c" OR …)
export function gmailFilterQuery(words: readonly string[] = RECEIPT_SUBJECT_WORDS): string {
  const terms = words.map((w) => (w.includes(" ") ? `"${w}"` : w));
  return `subject:(${terms.join(" OR ")})`;
}
