// Subject words for the automatic forwarding rules in the setup guide
// (/app/settings/forwarding). Rules match on the subject, not the body, so
// newsletters that merely mention a word stay out. English, Swedish and
// French, because that's what our customers' receipts are written in.
// Anything a rule lets through that isn't a receipt lands in "Review
// needed" and costs nothing until the user confirms it; a missed receipt is
// a lost expense, so the list leans towards catching more.
//
// Sized against ~100 real-style receipt subjects and ~50 non-receipts
// (2026-10-16): the first 12-word list caught ~60%, this one ~92%.

export const RECEIPT_SUBJECT_WORDS = [
  // English
  "receipt",
  "receipts",
  "invoice",
  "order confirmation",
  "booking confirmation",
  "confirmed",
  "ordered",
  "thanks for your payment",
  "trip with uber",
  // Swedish
  "kvitto",
  "kvitton",
  "faktura",
  "orderbekräftelse",
  "bokningsbekräftelse",
  "bekräftelse",
  "bekräftad",
  "beställning",
  "beställt",
  "bokning",
  "ditt köp",
  "biljett",
  // French
  "reçu",
  "facture",
  "factures",
  "confirmation de commande",
  "confirmation de réservation",
  "commande",
  "commandé",
  "réservation",
  "confirmée",
  "billet",
  "billets",
  "justificatif",
] as const;

// Gmail matches whole words only, so it also needs the compounds and
// spellings Outlook's substring match catches by itself. "recu" stays out
// of Outlook, where it would match "recurring".
export const GMAIL_ONLY_SUBJECT_WORDS = [
  "recu",
  "kvittot",
  "kvittokopia",
  "parkeringskvitto",
  "fakturan",
  "fakturakopia",
  "månadsfaktura",
  "betalningsbekräftelse",
  "köpbekräftelse",
  "commandée",
] as const;

// Gmail's "Has the words" field: subject:(a OR "b c" OR …). Phrases and
// hyphenated terms are quoted (a bare "-" would mean "exclude").
export function gmailFilterQuery(
  words: readonly string[] = [...RECEIPT_SUBJECT_WORDS, ...GMAIL_ONLY_SUBJECT_WORDS],
): string {
  const terms = words.map((w) => (/[\s-]/.test(w) ? `"${w}"` : w));
  return `subject:(${terms.join(" OR ")})`;
}

// Outlook's "Subject includes" matches substrings and takes one word at a
// time, so drop every word that already contains a shorter one from the
// list ("kvitton" contains "kvitto"): same matches, less typing.
export function outlookSubjectWords(words: readonly string[] = RECEIPT_SUBJECT_WORDS): string[] {
  return words.filter(
    (w) => !words.some((other) => other !== w && w.toLowerCase().includes(other.toLowerCase())),
  );
}
