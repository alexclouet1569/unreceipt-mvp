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
// brackets, drops quoted display names and comments (honouring backslash
// escapes inside them), and normalises each mailbox.
// `"receipts+x@in.unreceipt.com" <attacker@gmail.com>` yields only
// attacker@gmail.com: a sender-chosen display name never counts. Anything
// left unbalanced yields [] (refuse rather than guess).
export function parseAddressList(value: string): string[] {
  if (value.length > 4000) return [];
  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  let angle = 0;
  let comment = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (inQuote || comment > 0) {
      if (ch === "\\") {
        i++; // quoted-pair: the next character is literal
      } else if (inQuote && ch === '"') {
        inQuote = false;
      } else if (!inQuote && ch === "(") {
        comment++;
      } else if (!inQuote && ch === ")") {
        comment--;
      }
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
  if (inQuote || comment > 0 || angle > 0) return [];
  parts.push(current);
  return parts.map(normalizeAddress).filter((a): a is string => a != null);
}

// The header block is never read past this; a message whose headers don't
// end within it is refused rather than half-read.
const MAX_HEADER_BLOCK = 256 * 1024;

// Every value of one header in a raw message's header block, in order,
// with folded lines joined. The field name is matched trimmed and case-
// insensitively, as DKIM's relaxed canonicalisation does ("To :" is still
// To). Returns null when the header block can't be read in full (no blank
// line within MAX_HEADER_BLOCK) or mixes line endings: a bare "\n\n"
// inside a CRLF message could end our view of the headers early while a
// CRLF-only DKIM verifier still sees the signed ones. Callers must refuse.
export function rawHeaderValues(rawEml: string, name: string): string[] | null {
  const window = rawEml.slice(0, MAX_HEADER_BLOCK);
  const crlf = rawEml.includes("\r");
  const end = window.indexOf(crlf ? "\r\n\r\n" : "\n\n");
  if (end === -1) return null;
  const block = window.slice(0, end);
  if (crlf && /\r(?!\n)|(?<!\r)\n/.test(block)) return null;
  const lines = block.split(crlf ? "\r\n" : "\n");
  const values: string[] = [];
  const wanted = name.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const colon = lines[i].indexOf(":");
    if (colon <= 0 || /^[ \t]/.test(lines[i])) continue;
    if (lines[i].slice(0, colon).trim().toLowerCase() !== wanted) continue;
    let value = lines[i].slice(colon + 1);
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
  toHeaders: readonly string[] | null,
  owner: { personal: readonly string[]; alias: string },
): RecipientOwnership {
  if (!toHeaders || toHeaders.length !== 1) return "none";
  const recipients = new Set(parseAddressList(toHeaders[0]));
  const personal = owner.personal.map(normalizeAddress).filter((a): a is string => a != null);
  if (personal.some((a) => recipients.has(a))) return "personal";
  const alias = normalizeAddress(owner.alias);
  return alias != null && recipients.has(alias) ? "alias" : "none";
}
