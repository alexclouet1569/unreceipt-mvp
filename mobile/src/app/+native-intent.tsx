// Links that open the app from outside (Expo Router's native intent).
//
// unreceipt://mailboxes?status=… is the end of "Connect Gmail / Outlook".
// Normally the system sign-in sheet hands that URL straight back to the
// flow (src/lib/MailboxesProvider.tsx) and it never arrives here. If it
// does come in as a plain deep link (the flow finished in another browser,
// or the app was closed meanwhile), its outcome waits in the inbox and
// Account opens, where the provider claims the mailbox with this phone's
// own sign-in. Every other link goes on untouched.

import { parseMailboxUrl, putInInbox } from "../lib/mailboxes";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    const outcome = parseMailboxUrl(path);
    if (!outcome) return path;
    putInInbox(outcome);
    return "/account";
  } catch {
    return path;
  }
}
