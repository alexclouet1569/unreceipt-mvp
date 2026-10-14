// Storage paths on a receipt row (image_url, original_source_url) are
// user-editable through the "Users can update own receipts" RLS policy,
// but the routes that read them sign/download with the service-role
// client. Every upload path is `${userId}/...` (see /api/capture and
// /api/intake/email), so anything outside the caller's own folder is
// refused before it reaches storage.
export function isOwnedStoragePath(path: string, userId: string): boolean {
  if (!userId || !path.startsWith(`${userId}/`)) return false;
  return !path.split("/").some((segment) => segment === ".." || segment === ".");
}
