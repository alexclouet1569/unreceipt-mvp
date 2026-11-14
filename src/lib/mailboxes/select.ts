// Which messages in a connected mailbox (Gmail or Outlook) UnReceipt reads.
// Pure: decided from metadata only (subject, sender, attachment names), so
// the full message is downloaded only for a match and nothing else is ever
// stored, not even its id.
//
// Narrower than the forwarding guide's rules (forwarding-filters.ts): there
// the owner sets up the filter in their own mailbox and sees what it sends,
// here we decide for them, across the whole mailbox. So only words that say
// "receipt / invoice / order or booking confirmation / payment" select a
// message by its subject. The generic confirmation and booking words of the
// forwarding list ("confirmed", "bokning", "réservation", "billet"…) also
// match appointment and travel mail that isn't a purchase ("Appointment
// confirmed", "Bokning bekräftad" from a clinic), so on their own they
// select nothing: such a message is read only when it carries a
// receipt-named PDF ("Invoice-2026-11.pdf", "kvitto.pdf"), which selects it
// by itself. Anything else that still gets in lands in Review needed, is
// never shown to the accountant before the owner confirms it, and costs
// nothing until then.

export type MessageMeta = {
  subject: string;
  from: string;
  // File names of the message's attachments, when the provider lists them.
  attachmentNames: string[];
  hasAttachments: boolean;
};

/**
 * Subject words that select a message on their own: they name a receipt,
 * an invoice, an order or booking confirmation, or a payment. Single words
 * match whole words (inflected forms are spelled out); phrases match as
 * substrings.
 */
export const MAILBOX_RECEIPT_WORDS = [
  // English
  "receipt",
  "receipts",
  "invoice",
  "invoices",
  "order confirmation",
  "booking confirmation",
  "payment confirmation",
  "thanks for your payment",
  "thank you for your payment",
  "thanks for your order",
  "thank you for your order",
  "thank you for your purchase",
  "trip with uber",
  // Swedish
  "kvitto",
  "kvitton",
  "kvittot",
  "kvittokopia",
  "parkeringskvitto",
  "faktura",
  "fakturan",
  "fakturakopia",
  "månadsfaktura",
  "orderbekräftelse",
  "bokningsbekräftelse",
  "betalningsbekräftelse",
  "köpbekräftelse",
  "ditt köp",
  // French
  "reçu",
  "recu",
  "facture",
  "factures",
  "justificatif",
  "confirmation de commande",
  "confirmation de réservation",
  "confirmation de paiement",
] as const;

/**
 * Words of the forwarding rules that are too generic for a mailbox: they
 * select nothing by themselves (see the header). Listed so a test can check
 * that every forwarding word was deliberately sorted into one list or the
 * other.
 */
export const MAILBOX_GENERIC_WORDS = [
  "confirmed",
  "ordered",
  "bekräftelse",
  "bekräftad",
  "beställning",
  "beställt",
  "bokning",
  "biljett",
  "commande",
  "commandé",
  "commandée",
  "réservation",
  "confirmée",
  "billet",
  "billets",
] as const;

const WORDS = MAILBOX_RECEIPT_WORDS.map((w) => w.toLowerCase());

// "kvitto_123.pdf", "Invoice-2026-11.pdf", "facture.pdf", "e-ticket.pdf".
// The word starts the name or follows a non-letter ("Faktura12345" and
// "fakturan" count, "prereceipt" doesn't); "reçu" must also end there, so
// "recurring.pdf" isn't a receipt.
const RECEIPT_FILE =
  /(^|[^\p{L}])(receipt|invoice|kvitto|faktura|facture|ticket|biljett|billet|re[cç]u(?![\p{L}]))/iu;

// Never a receipt, whatever the subject says: our own mail (sign-in codes,
// reminders) and Gmail's forwarding confirmation.
const IGNORED_SENDERS = ["@unreceipt.com", "forwarding-noreply@google.com"];

function matchesWord(subject: string): boolean {
  const s = subject.toLowerCase();
  return WORDS.some((w) => {
    if (w.includes(" ")) return s.includes(w);
    // Whole words, like Gmail's own filter: the lists already spell out the
    // inflected forms ("kvittot", "commandée"), and "recu" mustn't match
    // "recurring".
    return new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(s);
  });
}

export function isLikelyReceipt(meta: MessageMeta): boolean {
  const from = meta.from.toLowerCase();
  if (IGNORED_SENDERS.some((s) => from.includes(s))) return false;
  if (matchesWord(meta.subject)) return true;
  // A generic subject ("Your booking is confirmed") counts only with a
  // receipt-named PDF, and such a PDF selects the message whatever its
  // subject says.
  return meta.attachmentNames.some((name) => /\.pdf$/i.test(name) && RECEIPT_FILE.test(name));
}
