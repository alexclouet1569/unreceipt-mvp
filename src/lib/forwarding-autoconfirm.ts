// SERVER-ONLY. Confirms a Gmail forwarding request for the user, so the
// setup guide skips "type the code Gmail sent us".
//
// Only for a request the user made themselves: the Gmail account asking to
// forward must be one of their own inboxes (sign-in email or an address
// they listed). Anyone who knows a forwarding alias can make Gmail send
// this email naming their own account; confirming that would route a
// stranger's mail into the user's inbox, so it's left to the user: the
// guide shows Gmail's link with the requesting address named, and warns
// when it isn't one of theirs (/api/forwarding/status ownInbox). The address must be read exactly from
// Gmail's subject line (forAddressExact), never from the body.
//
// Gmail confirms when its link is POSTed on mail.google.com (the link in the
// email points at mail-settings.google.com and shows a page with a button).
// Only that exact host and path are ever requested. Any failure leaves the
// code step as it was.

import { normalizeAddress } from "@/lib/email-address";

const LINK = /^https:\/\/mail-settings\.google\.com\/mail\/(vf-[A-Za-z0-9%._~-]{10,600})$/;

export function gmailConfirmEndpoint(confirmUrl: string): string | null {
  const m = LINK.exec(confirmUrl);
  return m ? `https://mail.google.com/mail/${m[1]}` : null;
}

/** The same mailbox, as the addresses page stores them (Gmail dots, +tags). */
export function isOwnInbox(forAddress: string | null, ownAddresses: string[]): boolean {
  const wanted = forAddress ? normalizeAddress(forAddress) : null;
  if (!wanted) return false;
  return ownAddresses.some((a) => normalizeAddress(a) === wanted);
}

export async function confirmGmailForwarding(confirmUrl: string): Promise<boolean> {
  const endpoint = gmailConfirmEndpoint(confirmUrl);
  if (!endpoint) return false;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      body: "",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    // A redirect is most likely to a sign-in page: not a confirmation.
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}
