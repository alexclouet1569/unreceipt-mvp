// Pure email-address helpers for the receipt ownership check: was this
// receipt originally sent to one of the user's own addresses?

const ADDRESS_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;

// "Anna <Anna.Svensson+kvitton@Gmail.com>" → "annasvensson@gmail.com".
// Compares the mailbox, not the spelling: lower case, and for Gmail no dots
// and no "+tag" (Gmail ignores both). "+tags" elsewhere are kept: on our own
// inbound domain the tag IS the user (receipts+<hash>@), and dropping it
// would make every alias look the same. Only the final <…> counts as the
// address, so a display name like "<anna@gmail.com>" can't stand in for it.
// Null when it isn't an address.
export function normalizeAddress(raw: string): string | null {
  const angle = raw.match(/<([^<>]{1,320})>\s*$/);
  const bare = (angle ? angle[1] : raw).trim().toLowerCase();
  if (!ADDRESS_RE.test(bare)) return null;
  const at = bare.lastIndexOf("@");
  let local = bare.slice(0, at);
  let domain = bare.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\+.*$/, "").replace(/\./g, "");
  return local.length > 0 ? `${local}@${domain}` : null;
}

// Splits an address-list header value at commas outside quotes and angle
// brackets, drops quoted display names and comments, and normalises each
// mailbox. `"receipts+x@in.unreceipt.com" <attacker@gmail.com>` yields only
// attacker@gmail.com: a sender-chosen display name never counts.
export function parseAddressList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  let angle = 0;
  let comment = 0;
  for (const ch of value.slice(0, 4000)) {
    if (inQuote) {
      if (ch === '"') inQuote = false;
      continue;
    }
    if (comment > 0) {
      if (ch === "(") comment++;
      else if (ch === ")") comment--;
      continue;
    }
    if (ch === '"') {
      inQuote = true;
    } else if (ch === "(") {
      comment++;
    } else if (ch === "," && angle === 0) {
      parts.push(current);
      current = "";
    } else {
      if (ch === "<") angle++;
      if (ch === ">") angle = Math.max(0, angle - 1);
      current += ch;
    }
  }
  parts.push(current);
  return parts.map(normalizeAddress).filter((a): a is string => a != null);
}

// Every value of one header in a raw message's header block, in order,
// with folded lines joined. Only the first 64 KB is read.
export function rawHeaderValues(rawEml: string, name: string): string[] {
  const head = rawEml.slice(0, 65_536).split(/\r?\n\r?\n/, 1)[0];
  const lines = head.split(/\r?\n/);
  const values: string[] = [];
  const prefix = `${name.toLowerCase()}:`;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].toLowerCase().startsWith(prefix)) continue;
    let value = lines[i].slice(prefix.length);
    while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1])) value += " " + lines[++i].trim();
    values.push(value.trim());
  }
  return values;
}

export type RecipientOwnership = "personal" | "alias" | "none";

// Whose receipt is this? "personal" when the To: names one of the user's
// own inboxes, "alias" when it was sent straight to their forwarding
// address, otherwise "none". `toHeaders` are the message's To: header
// values; anything but exactly one is refused, because DKIM signs only the
// last copy of a repeated header and a second one could be slipped in.
// Cc: never counts, for the same reason.
export function recipientOwnership(
  toHeaders: readonly string[],
  owner: { personal: readonly string[]; alias: string },
): RecipientOwnership {
  if (toHeaders.length !== 1) return "none";
  const recipients = new Set(parseAddressList(toHeaders[0]));
  const personal = owner.personal.map(normalizeAddress).filter((a): a is string => a != null);
  if (personal.some((a) => recipients.has(a))) return "personal";
  const alias = normalizeAddress(owner.alias);
  return alias != null && recipients.has(alias) ? "alias" : "none";
}
