// Gmail only starts auto-forwarding to an address once someone types the
// confirmation code Gmail mails to that address. For us that address is the
// user's receipts+<hash>@ alias, so the email lands in /api/intake/email.
// This module recognises it, so intake can keep the code for the setup
// guide (/app/settings/forwarding) instead of filing it as a receipt
// (launch plan action 84).
//
// Pure: no I/O. The sender is spoofable, so we keep only what is safe to
// show the alias owner: a digits-only code (a fake one simply fails in
// Gmail) and the Gmail address, if it looks like one. Never the link: a
// spoofed link would be a phishing lure shown inside our own UI.

export const GMAIL_FORWARDING_SENDER = "forwarding-noreply@google.com";

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

const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}/;

function findCode(subject: string, text: string): string | null {
  // Subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from …"
  const inSubject = subject.match(/\(#(\d{6,12})\)/);
  if (inSubject) return inSubject[1];
  // Body: "Confirmation code: 123456789" (the label is localised, the
  // number isn't).
  const inBody = text.match(/:\s*(\d{6,12})\b/);
  return inBody ? inBody[1] : null;
}

function findForAddress(subject: string, text: string): string | null {
  // Subject ends "… Receive Mail from someone@gmail.com"; the body starts
  // "someone@gmail.com has requested to automatically forward mail …".
  const fromSubject = subject.match(/\bfrom\s+(\S+@\S+)\s*$/i)?.[1];
  const candidate = fromSubject ?? text.match(EMAIL)?.[0] ?? null;
  if (!candidate) return null;
  const match = candidate.match(EMAIL);
  if (!match || match[0].length > 254) return null;
  // Our own alias appears in the body too; it isn't the Gmail account.
  if (match[0].toLowerCase().startsWith("receipts+")) return null;
  return match[0].toLowerCase();
}

export function parseForwardingConfirmation(input: {
  from: string;
  subject: string;
  text: string | null;
}): ForwardingConfirmation | null {
  if (bareAddress(input.from) !== GMAIL_FORWARDING_SENDER) return null;
  const text = input.text ?? "";
  return {
    provider: "gmail",
    code: findCode(input.subject, text),
    forAddress: findForAddress(input.subject, text),
  };
}
