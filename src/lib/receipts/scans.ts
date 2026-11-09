// Where an uploaded multi-page scan is kept whole (receipt-originals,
// under the user's own folder so account deletion removes it), and which
// paths a client may point a page receipt at. The path comes from the
// client, so it is checked like a staged photo (src/lib/receipts/staging.ts).

export const SCAN_BUCKET = "receipt-originals";
export const MAX_SCAN_PAGES = 50;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function scanPathFor(userId: string): string {
  return `${userId}/scans/${crypto.randomUUID()}.pdf`;
}

export function isOwnScanPath(userId: string, path: string): boolean {
  if (!new RegExp(`^${UUID}$`, "i").test(userId)) return false;
  const prefix = `${userId}/scans/`;
  return path.startsWith(prefix) && new RegExp(`^${UUID}\\.pdf$`).test(path.slice(prefix.length));
}

/** A scan shared by several page receipts: never deleted with just one of them. */
export function isScanPath(path: string): boolean {
  return /^[^/]+\/scans\/[^/]+\.pdf$/.test(path);
}
