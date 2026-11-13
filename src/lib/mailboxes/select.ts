// Which messages in a connected mailbox (Gmail or Outlook) UnReceipt reads.
// Pure: decided from metadata only (subject, sender, attachment names), so
// the full message is downloaded only for a match and nothing else is ever
// stored, not even its id.
//
// Same subject words as the forwarding guide's rules (forwarding-filters.ts),
// plus a PDF or receipt-named attachment, which catches invoices whose
// subject says nothing ("Your documents from X"). Leaning towards catching
// more is deliberate: a non-receipt lands in "Review needed" and costs
// nothing until confirmed; a missed receipt is a lost expense.

import { GMAIL_ONLY_SUBJECT_WORDS, RECEIPT_SUBJECT_WORDS } from "@/lib/forwarding-filters";

export type MessageMeta = {
  subject: string;
  from: string;
  // File names of the message's attachments, when the provider lists them.
  attachmentNames: string[];
  hasAttachments: boolean;
};

const WORDS = [...RECEIPT_SUBJECT_WORDS, ...GMAIL_ONLY_SUBJECT_WORDS].map((w) => w.toLowerCase());

// "kvitto_123.pdf", "Invoice-2026-11.pdf", "facture.pdf"
const RECEIPT_FILE = /(receipt|invoice|kvitto|faktura|facture|re[cç]u|ticket|biljett|billet)/i;

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
  return meta.attachmentNames.some((name) => /\.pdf$/i.test(name) && RECEIPT_FILE.test(name));
}
