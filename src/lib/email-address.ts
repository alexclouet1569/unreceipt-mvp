// Pure email-address helpers for the receipt ownership check: was this
// receipt originally sent to one of the user's own addresses?

const ADDRESS_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;

// "Anna <Anna.Svensson+kvitton@Gmail.com>" → "annasvensson@gmail.com".
// Compares the mailbox, not the spelling: lower case, and for Gmail no dots
// and no "+tag" (Gmail ignores both). "+tags" elsewhere are kept: on our own
// inbound domain the tag IS the user (receipts+<hash>@), and dropping it
// would make every alias look the same. Null when it isn't an address.
export function normalizeAddress(raw: string): string | null {
  const angle = raw.match(/<([^<>]{1,320})>/);
  const bare = (angle ? angle[1] : raw).trim().toLowerCase();
  if (!ADDRESS_RE.test(bare)) return null;
  const at = bare.lastIndexOf("@");
  let local = bare.slice(0, at);
  let domain = bare.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\+.*$/, "").replace(/\./g, "");
  return local.length > 0 ? `${local}@${domain}` : null;
}

// Checks only the mailbox, so the display form can be kept for the UI.
export function isValidAddress(raw: string): boolean {
  return normalizeAddress(raw) != null;
}

export function isAddressedToOwner(recipients: readonly string[], ownerAddresses: readonly string[]): boolean {
  const owner = new Set(ownerAddresses.map(normalizeAddress).filter((a): a is string => a != null));
  return recipients.some((r) => {
    const n = normalizeAddress(r);
    return n != null && owner.has(n);
  });
}
