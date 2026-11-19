/**
 * The list's search request (GET /api/mobile/receipts, src/lib/home/search.ts
 * on the server): `q` and a month (YYYY-MM) or a year (YYYY); `after` (a
 * receipt's listKey) continues a page. Pure, so it is tested without the API.
 */
export function searchPath(q: string, period: string, after: string | null): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (/^\d{4}-\d{2}$/.test(period)) params.set("month", period);
  else if (/^\d{4}$/.test(period)) params.set("year", period);
  if (after) params.set("after", after);
  return `/api/mobile/receipts?${params.toString()}`;
}
