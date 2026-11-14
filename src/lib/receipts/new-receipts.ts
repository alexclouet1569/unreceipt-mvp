// The "N new receipts from your email" notice: which of the receipts the
// server calls fresh (GET /api/receipts/updates) the user hasn't looked at
// yet. Pure, shared by the website (src/app/app/(authed)/use-receipt-updates.ts)
// and copied by the iPhone app (mobile/src/lib/newReceipts.ts, which can't
// import values from here).
//
// The cursor is a receipt's own created_at (never a device clock): `after`
// is the newest receipt the user has seen or dismissed, `opened` the fresh
// receipts already opened one by one. Kept per device.

export type SeenState = { after: string | null; opened: string[] };
export type Fresh = { id: string; createdAt: string };

export const EMPTY_SEEN: SeenState = { after: null, opened: [] };

/** The first answer ever on this device: everything that exists now counts as seen. */
export function startSeen(seen: SeenState, latestCreatedAt: string | null): SeenState {
  if (seen.after || !latestCreatedAt) return seen;
  return { after: latestCreatedAt, opened: [] };
}

/** The fresh receipts still to show (newest first): after the cursor and not opened. */
export function unseen(fresh: Fresh[], seen: SeenState): Fresh[] {
  const opened = new Set(seen.opened);
  const after = seen.after ? Date.parse(seen.after) : null;
  return fresh.filter((f) => !opened.has(f.id) && (after == null || Date.parse(f.createdAt) > after));
}

function newest(fresh: Fresh[]): string | null {
  let max: string | null = null;
  for (const f of fresh) if (max == null || Date.parse(f.createdAt) > Date.parse(max)) max = f.createdAt;
  return max;
}

/**
 * One receipt opened. When it was the last one shown, the cursor moves past
 * them all and the list of opened ones empties (it never grows for long).
 */
export function markOpened(seen: SeenState, fresh: Fresh[], id: string): SeenState {
  const opened = seen.opened.includes(id) ? seen.opened : [...seen.opened, id];
  const next = { ...seen, opened };
  return unseen(fresh, next).length === 0 ? dismissAll(next, fresh) : next;
}

/** "Not now": every receipt shown counts as seen. */
export function dismissAll(seen: SeenState, fresh: Fresh[]): SeenState {
  const max = newest(fresh);
  if (!max) return seen;
  const after = seen.after && Date.parse(seen.after) > Date.parse(max) ? seen.after : max;
  return { after, opened: [] };
}

/** A stored value, or the empty state when it isn't one. */
export function parseSeen(raw: string | null): SeenState {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<SeenState> | null;
    if (!value || typeof value !== "object") return EMPTY_SEEN;
    const after = typeof value.after === "string" && Number.isFinite(Date.parse(value.after)) ? value.after : null;
    const opened = Array.isArray(value.opened) ? value.opened.filter((x): x is string => typeof x === "string").slice(-50) : [];
    return { after, opened };
  } catch {
    return EMPTY_SEEN;
  }
}
