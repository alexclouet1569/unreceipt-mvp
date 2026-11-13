// SERVER-ONLY. The one-screen confirmation shown when the iPhone app's
// connect link is opened: it names the UnReceipt account the mailbox will
// be connected to, and only its Continue button (a same-origin POST) starts
// the OAuth flow. A link someone else sent can therefore never connect the
// reader's mailbox to the sender's account without the reader seeing whose
// account it is and pressing Continue.
//
// Plain HTML from a route handler (no React, no scripts): it opens in the
// system sign-in sheet and lives a few seconds. Colours are DESIGN.md
// tokens (light values, with the dark ones under prefers-color-scheme).

import type { MailboxProviderId } from "./types";
import { APP_RETURN_URL } from "./oauth";

const PROVIDER_NAMES: Record<MailboxProviderId, string> = {
  google: "Gmail",
  microsoft: "Outlook",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function confirmPageHtml(input: {
  provider: MailboxProviderId;
  maskedAccount: string;
  linkToken: string;
}): string {
  const name = PROVIDER_NAMES[input.provider];
  // The form posts back to this route; see continuePageHtml() for why the
  // answer is a page rather than a redirect.
  const action = `/api/mailboxes/connect/${input.provider}`;
  const cancel = `${APP_RETURN_URL}?status=cancelled`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>Connect ${escapeHtml(name)} · UnReceipt</title>
<style>
  :root { --surface:#FAFAF7; --card:#FFFFFF; --ink:#303568; --ink-muted:#5A5F7A; --hairline:#E8E5DD; --brand-action:#1A7F52; --on-brand-action:#FFFFFF; }
  @media (prefers-color-scheme: dark) {
    :root { --surface:#0F1124; --card:#1A1D33; --ink:#EFE8DA; --ink-muted:#A4A8C0; --hairline:#2A2D45; --brand-action:#27BE7B; --on-brand-action:#0F1124; }
  }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px; background:var(--surface); color:var(--ink); font-family:Figtree, system-ui, -apple-system, sans-serif; }
  main { width:100%; max-width:420px; background:var(--card); border:1px solid var(--hairline); border-radius:16px; padding:24px; }
  h1 { font-family:Manrope, system-ui, -apple-system, sans-serif; font-size:22px; line-height:1.25; margin:0 0 12px; }
  p { margin:0 0 12px; line-height:1.5; color:var(--ink-muted); }
  strong { color:var(--ink); }
  button { width:100%; margin-top:12px; min-height:48px; border:0; border-radius:12px; background:var(--brand-action); color:var(--on-brand-action); font:600 16px/1 Figtree, system-ui, sans-serif; cursor:pointer; }
  a { display:block; text-align:center; margin-top:16px; color:var(--ink-muted); }
</style>
</head>
<body>
<main>
  <h1>Connect ${escapeHtml(name)} to UnReceipt</h1>
  <p>Receipts from the mailbox you choose next will be saved in the UnReceipt account <strong>${escapeHtml(input.maskedAccount)}</strong>.</p>
  <p>UnReceipt looks only at emails that look like receipts or invoices, and saves only those. You can disconnect any time.</p>
  <form method="post" action="${escapeHtml(action)}">
    <input type="hidden" name="link" value="${escapeHtml(input.linkToken)}">
    <button type="submit">Continue</button>
  </form>
  <a href="${escapeHtml(cancel)}">Not your account? Cancel</a>
</main>
</body>
</html>`;
}

export const PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

/**
 * The answer to the confirmation page's POST. The site's CSP has
 * `form-action 'self'`, which browsers also apply to redirects that follow
 * a form submission, so a 303 to accounts.google.com (or to unreceipt://)
 * would be blocked. Instead the POST answers with a page that moves on by
 * itself (meta refresh, not a form submission), with a link as fallback.
 */
export function continuePageHtml(target: string): string {
  const url = escapeHtml(target);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${url}">
<title>UnReceipt</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px; background:#FAFAF7; color:#303568; font-family:Figtree, system-ui, -apple-system, sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#0F1124; color:#EFE8DA; } }
  a { color:inherit; }
</style>
</head>
<body><p><a href="${url}">Continue</a></p></body>
</html>`;
}
