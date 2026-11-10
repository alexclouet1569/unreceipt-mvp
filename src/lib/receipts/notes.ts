// Sentences the server itself writes into a receipt's notes (English). The
// iPhone app shows them in the user's language instead, so they are defined
// once here and recognised by src/lib/mobile/receipt.ts.

export const DUPLICATE_NOTE = "Possible duplicate: another receipt has the same merchant, amount and date.";

export function scanPageNote(page: number, pages: number): string {
  return `Page ${page} of ${pages} of a scanned PDF; the whole file is kept as the original.`;
}

const PAGE_NOTE = /Page \d+ of \d+ of a scanned PDF; the whole file is kept as the original\./g;

/** The user's own words, without the sentences the server added. */
export function userNotes(notes: string | null): string | null {
  if (!notes) return null;
  const rest = notes.replace(DUPLICATE_NOTE, "").replace(PAGE_NOTE, "").replace(/\s+/g, " ").trim();
  return rest || null;
}

export function isPossibleDuplicate(notes: string | null): boolean {
  return Boolean(notes?.includes(DUPLICATE_NOTE));
}
