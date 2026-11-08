// SERVER-ONLY. Confirms a Gmail forwarding request for the user, so the
// setup guide skips "type the code Gmail sent us".
//
// Only for a request the user made themselves: the Gmail account asking to
// forward must be one of their own inboxes (sign-in email or an address
// they listed). Anyone who knows a forwarding alias can make Gmail send
// this email naming their own account; confirming that would route a
// stranger's mail into the user's inbox, so it's left to the user (who
// then sees the code, as before).
//
// Gmail confirms when its link is POSTed on mail.google.com (the link in the
// email points at mail-settings.google.com and shows a page with a button).
// Only that exact host and path are ever requested. Any failure leaves the
// code step as it was.

const LINK = /^https:\/\/mail-settings\.google\.com\/mail\/(vf-[A-Za-z0-9%._~-]{10,600})$/;

export function gmailConfirmEndpoint(confirmUrl: string): string | null {
  const m = LINK.exec(confirmUrl);
  return m ? `https://mail.google.com/mail/${m[1]}` : null;
}

export function isOwnInbox(forAddress: string | null, ownAddresses: string[]): boolean {
  if (!forAddress) return false;
  const wanted = forAddress.trim().toLowerCase();
  return ownAddresses.some((a) => a.trim().toLowerCase() === wanted);
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
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}
