// Gmail only starts auto-forwarding to an address once that address approves
// it. For us that address is the user's receipts+<hash>@ alias, so Gmail's
// "confirm forwarding" email lands in /api/intake/email. This module
// recognises it, so intake can keep what the setup guide needs instead of
// filing it as a receipt (launch plan action 84).
//
// Gmail's format changed (seen 2026-11-13): the email now carries only a
// confirmation link (mail-settings.google.com/mail/vf-…), no code, while
// Gmail's settings screen still shows a code box. So the link is what the
// guide offers ("Confirm in Gmail"); a code is still read from the older
// format.
//
// Pure: no I/O. The From: header is spoofable, so we require Resend's DMARC
// pass (computed on receipt, not forgeable by the sender) as proof the
// email really came from google.com. Without it the email falls through to
// the normal receipt path (Review needed). Either way we keep only what is
// safe to show the alias owner: a digits-only code, the Gmail address if it
// looks like one, and the link only when it is exactly Gmail's own
// confirmation page (isGmailConfirmUrl: that host and path, nothing else),
// so it can never become a lure to another site inside our UI.

export const GMAIL_FORWARDING_SENDER = "forwarding-noreply@google.com";

// The guide stops offering a code after this, and the daily cleanup deletes
// it: by then it's from an earlier attempt and only the Gmail address is
// left, which we have no reason to keep.
export const CONFIRMATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ForwardingConfirmation = {
  provider: "gmail";
  // Null in Gmail's current format (link only) or when no code could be read.
  code: string | null;
  // The Gmail account asking to forward, if it could be read.
  forAddress: string | null;
  // True only when forAddress is exactly the address at the end of Gmail's
  // subject ("… Receive Mail from x@y"). Only then may it be acted on: the
  // body fallback can read just the start of a crafted long address.
  forAddressExact: boolean;
  // Gmail's own confirmation link (mail-settings.google.com/mail/vf-…), only
  // when it passes isGmailConfirmUrl(). Used to confirm for the user and,
  // stored, offered as "Confirm in Gmail" in the guide.
  confirmUrl: string | null;
};

// "https://mail-settings.google.com/mail/vf-%5B…%5D-…" up to the first
// character that can't be in it.
const CONFIRM_URL = /https:\/\/mail-settings\.google\.com\/mail\/vf-[A-Za-z0-9%._~\-]{10,600}/;
const CONFIRM_URL_EXACT = /^https:\/\/mail-settings\.google\.com\/mail\/vf-[A-Za-z0-9%._~\-]{10,600}$/;

/**
 * True only for Gmail's own forwarding-confirmation page: https, exactly
 * mail-settings.google.com, path /mail/vf-…, no query or fragment. Checked
 * again wherever a stored link is read back, before it is shown.
 */
export function isGmailConfirmUrl(url: unknown): url is string {
  return typeof url === "string" && CONFIRM_URL_EXACT.test(url);
}

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

// A whole address in running text: not part of a longer one on either side.
const WHOLE_EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}(?![A-Za-z0-9.-])/g;

function findForAddress(subject: string, text: string): { address: string | null; exact: boolean } {
  // Subject ends "… Receive Mail from someone@gmail.com"; the body starts
  // "someone@gmail.com has requested to automatically forward mail …".
  const fromSubject = subject.match(/\bfrom\s+(\S{1,254})\s*$/i)?.[1];
  if (fromSubject) {
    const match = fromSubject.match(EMAIL);
    if (match?.[0] === fromSubject) {
      const address = cleanAddress(match[0]);
      return { address, exact: address !== null };
    }
  }
  for (const match of text.matchAll(WHOLE_EMAIL)) {
    const address = cleanAddress(match[0]);
    if (address) return { address, exact: false };
  }
  return { address: null, exact: false };
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
  const forAddress = findForAddress(subject, text);
  return {
    provider: "gmail",
    code: findCode(subject, text),
    forAddress: forAddress.address,
    forAddressExact: forAddress.exact,
    confirmUrl: ((u) => (isGmailConfirmUrl(u) ? u : null))(text.match(CONFIRM_URL)?.[0]),
  };
}
