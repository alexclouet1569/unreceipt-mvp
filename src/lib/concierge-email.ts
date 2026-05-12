/**
 * Derives a stable per-user concierge inbox address shown in the empty
 * state. The actual MX routing for u-XXXX@unreceipt.com is not yet wired
 * (WOZ phase) — this just gives every customer a memorable address to
 * forward email receipts to once routing exists.
 */

/**
 * Deterministic 4-char lowercase alphanumeric hash of the userId. Same
 * userId → same hash forever (so customers can save the address).
 */
export function conciergePrefix(userId: string): string {
  // FNV-1a 32-bit — good distribution for short strings that differ in
  // only a few characters (UUIDs that share a long common prefix).
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Use the LOW 4 base-36 digits (driven mostly by trailing bytes of the
  // input — UUIDs vary at the tail, not the head).
  const tag = (h >>> 0).toString(36).slice(-4).padStart(4, "0");
  return tag;
}

export function getConciergeEmail(userId: string): string {
  return `u-${conciergePrefix(userId)}@unreceipt.com`;
}
