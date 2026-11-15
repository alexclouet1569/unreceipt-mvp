// "Invite several" (/firm/clients): the pasted list read into invites. One
// client per line, in the shapes people paste: an address alone,
// "Company, address" (or ";" or a tab, as copied from a spreadsheet), or
// "Company <address>". Pure; the server checks every address again
// (POST /api/firm/clients/bulk).

/** "Invite several": at most this many addresses per send. */
export const MAX_BULK = 25;

export type BulkInvite = { client_name?: string; email: string };

const EMAIL = /[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/;

export function parseInviteLines(text: string): { invites: BulkInvite[]; unreadable: string[] } {
  const invites: BulkInvite[] = [];
  const unreadable: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = EMAIL.exec(line);
    if (!match) {
      unreadable.push(line.slice(0, 200));
      continue;
    }
    const email = match[0].toLowerCase();
    const name = (line.slice(0, match.index) + " " + line.slice(match.index + match[0].length))
      .replace(/[<>]/g, " ")
      .replace(/^[\s,;\t]+|[\s,;\t]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    invites.push(name ? { client_name: name, email } : { email });
  }
  return { invites, unreadable };
}
