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
//
// Learned from the first real mailbox (2026-11-14: 23 of 27 imported
// emails were conversations ABOUT receipts, not receipts):
//   - a reply ("Re:", "Sv:", "AW:", "Réf :"…) is a conversation, never a
//     receipt, and neither is a mailing-list or notification email
//     (a List-Id header, GitHub notifications): both are read only with a
//     receipt-named PDF;
//   - plurals ("receipts", "invoices", "kvitton", "factures") talk about
//     receipts rather than being one, so they select nothing alone;
//   - French "reçu" is mostly the verb ("Vous avez reçu un courrier"):
//     only phrases that name a receipt ("votre reçu", "reçu de paiement")
//     count.

export type MessageMeta = {
  subject: string;
  from: string;
  /**
   * The List-Id header (RFC 2919) when the provider gives it (Gmail's
   * metadata read does; Outlook's list rows don't): a mailing list or
   * notification feed, not a purchase.
   */
  listId?: string | null;
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
  "invoice",
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
  "votre reçu",
  "votre recu",
  "reçu de paiement",
  "recu de paiement",
  "reçu n°",
  "recu n°",
  "reçu fiscal",
  "recu fiscal",
  "reçu d'achat",
  "recu d'achat",
  "facture",
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
  // Plurals talk about receipts rather than being one ("Question about how
  // you collect receipts"), and bare "reçu" is mostly the verb.
  "receipts",
  "invoices",
  "kvitton",
  "factures",
  "reçu",
  "recu",
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
const IGNORED_SENDERS = ["@unreceipt.com", "forwarding-noreply@google.com", "notifications@github.com"];

// "Re:", "RE[2]:", "Sv:", "SV:" (Swedish, Norwegian, Danish), "Svar:",
// "AW:"/"Antw:" (German, Dutch), "Réf :"/"Ref:" (French), "Rif:" (Italian),
// "VS:" (Finnish), "Odp:" (Polish): a reply in a conversation. Forwards
// ("Fwd:", "TR:", "VB:") are not replies: a forwarded receipt is a receipt.
// No two \s* next to each other: a subject of "re" and a million spaces
// (anyone can send one) must not backtrack quadratically. Only the start
// of the subject is ever tested.
const REPLY_PREFIX = /^\s*(?:re|sv|svar|aw|antw|antwort|r[ée]f|rif|vs|odp)\s*(?:\[\d+\]\s*)?:/i;

/** The subject starts with a reply prefix. */
export function isReply(subject: string): boolean {
  return REPLY_PREFIX.test(subject.slice(0, 200));
}

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

function hasReceiptPdf(meta: MessageMeta): boolean {
  return meta.attachmentNames.some((name) => /\.pdf$/i.test(name) && RECEIPT_FILE.test(name));
}

export function isLikelyReceipt(meta: MessageMeta): boolean {
  const from = meta.from.toLowerCase();
  if (IGNORED_SENDERS.some((s) => from.includes(s))) return false;
  // A conversation or a list/notification email: only a receipt PDF counts.
  if (isReply(meta.subject) || (meta.listId ?? "").trim() !== "") return hasReceiptPdf(meta);
  if (matchesWord(meta.subject)) return true;
  // A generic subject ("Your booking is confirmed") counts only with a
  // receipt-named PDF, and such a PDF selects the message whatever its
  // subject says.
  return hasReceiptPdf(meta);
}
