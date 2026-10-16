// Gmail only starts auto-forwarding to an address once someone types the
// confirmation code Gmail mails to that address. For us that address is the
// user's receipts+<hash>@ alias, so the email lands in /api/intake/email.
// This module recognises it, so intake can keep the code for the setup
// guide (/app/settings/forwarding) instead of filing it as a receipt
// (launch plan action 84).
//
// Pure: no I/O. The From: header is spoofable, so we require Resend's DMARC
// pass (computed on receipt, not forgeable by the sender) as proof the
// email really came from google.com. Without it the email falls through to
// the normal receipt path (Review needed, where the user can still read the
// code in the original). Either way we keep only what is safe to show the
// alias owner: a digits-only code (a fake one simply fails in Gmail) and the
// Gmail address, if it looks like one. Never the link: a spoofed link would
// be a phishing lure shown inside our own UI.

export const GMAIL_FORWARDING_SENDER = "forwarding-noreply@google.com";

// The guide stops offering a code after this, and the daily cleanup deletes
// it: by then it's from an earlier attempt and only the Gmail address is
// left, which we have no reason to keep.
export const CONFIRMATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ForwardingConfirmation = {
  provider: "gmail";
  // Null when the email came from Gmail's forwarding sender but no code
  // could be read (a format change). The guide then says so.
  code: string | null;
  // The Gmail account asking to forward, if it could be read.
  forAddress: string | null;
};

// "Gmail Team <forwarding-noreply@google.com>" → "forwarding-noreply@google.com"
function bareAddress(from: string): string {
  const angle = from.match(/<([^>]+)>/);
  return (angle ? angle[1] : from).trim().toLowerCase();
}

const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}/g;
// Real confirmation emails are short; cutting the input keeps every regex
// below fast on hostile mail (a 60 KB subject took 6.5 s before).
const MAX_SUBJECT = 500;
const MAX_TEXT = 10_000;

function findCode(subject: string, text: string): string | null {
  // Subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from …"
  const inSubject = subject.match(/\(#(\d{6,12})\)/);
  if (inSubject) return inSubject[1];
  // Body: "Confirmation code: 123456789", "Bekräftelsekod: …", "Code de
  // confirmation : …". Prefer the labelled number over any other one
  // (a phone number earlier in the body was picked before).
  const labelled = text.match(/(?:code|kod)[^\d\n]{0,40}?(\d{6,12})\b/i);
  if (labelled) return labelled[1];
  const inBody = text.match(/:\s*(\d{6,12})\b/);
  return inBody ? inBody[1] : null;
}

function cleanAddress(candidate: string | undefined): string | null {
  if (!candidate || candidate.length > 254) return null;
  const lower = candidate.toLowerCase();
  // Our own alias appears in the body too; it isn't the Gmail account.
  return lower.startsWith("receipts+") ? null : lower;
}

function findForAddress(subject: string, text: string): string | null {
  // Subject ends "… Receive Mail from someone@gmail.com"; the body starts
  // "someone@gmail.com has requested to automatically forward mail …".
  const fromSubject = subject.match(/\bfrom\s+(\S{1,254})\s*$/i)?.[1];
  if (fromSubject) {
    const match = fromSubject.match(EMAIL);
    if (match?.[0] === fromSubject) return cleanAddress(match[0]);
  }
  for (const match of text.matchAll(EMAIL)) {
    const address = cleanAddress(match[0]);
    if (address) return address;
  }
  return null;
}

export function parseForwardingConfirmation(input: {
  from: string;
  subject: string;
  text: string | null;
  // Resend's DMARC verdict for the From: domain; null when unknown.
  dmarc: string | null;
}): ForwardingConfirmation | null {
  if (bareAddress(input.from) !== GMAIL_FORWARDING_SENDER) return null;
  if (input.dmarc !== "pass") return null;
  const subject = input.subject.slice(0, MAX_SUBJECT);
  const text = (input.text ?? "").slice(0, MAX_TEXT);
  return {
    provider: "gmail",
    code: findCode(subject, text),
    forAddress: findForAddress(subject, text),
  };
}
