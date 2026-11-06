// Names people type that end up in emails we send from unreceipt.com
// (a self-created firm's name, a company's name in an invite subject).
// Firms used to be created by hand; since 2026-11-05 an accountant can
// create one by accepting a client's invite, so the name is checked: no
// web or email addresses, and no authority or UnReceipt names that would
// make an invite look official.

const RESERVED = [
  "unreceipt",
  "skatteverket",
  "bolagsverket",
  "kronofogden",
  "försäkringskassan",
  "riksbanken",
  "polisen",
  "finansinspektionen",
];

export function isAcceptableDisplayName(raw: string): boolean {
  const name = raw.trim();
  if (name.length < 2 || name.length > 200) return false;
  if (/(https?:|www\.|@|\.(se|com|net|org|io|nu|eu|app)\b)/i.test(name)) return false;
  const lower = name.toLowerCase();
  return !RESERVED.some((r) => lower.includes(r));
}
