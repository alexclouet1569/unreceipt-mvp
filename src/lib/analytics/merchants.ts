// One merchant under its many spellings ("ICA Kvantum", "ICA KVANTUM AB",
// "Ica kvantum"). Pure. Conservative: only case, punctuation, spacing and a
// trailing company form are ignored, so two different shops never merge.

const COMPANY_FORMS = new Set([
  "ab",
  "publ",
  "aktiebolag",
  "hb",
  "kb",
  "ltd",
  "limited",
  "inc",
  "llc",
  "plc",
  "gmbh",
  "sarl",
  "sas",
  "sa",
  "bv",
  "oy",
  "as",
  "asa",
  "aps",
]);

/** The grouping key, or null for a receipt without a merchant. */
export function merchantKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const words = name
    .toLocaleLowerCase("sv-SE")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}&]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (words.length > 1 && COMPANY_FORMS.has(words[words.length - 1])) words.pop();
  const key = words.join(" ");
  return key || null;
}
