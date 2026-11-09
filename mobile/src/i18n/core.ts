// Pure language logic (no React Native), so it runs in the tests.

import { en, type Strings } from "./en";
import { fr } from "./fr";
import { sv } from "./sv";

export type Locale = "en" | "sv" | "fr";

const STRINGS: Record<Locale, Strings> = { en, sv, fr };

/**
 * The first of the phone's preferred languages that the app speaks, else
 * English. iOS restarts the app when the language changes, so this is read
 * once at start.
 */
export function pickLocale(languageCodes: ReadonlyArray<string | null | undefined>): Locale {
  for (const code of languageCodes) {
    const base = code?.toLowerCase().split(/[-_]/)[0];
    if (base === "sv" || base === "fr" || base === "en") return base;
    // Norwegian and Danish readers understand Swedish better than English.
    if (base === "nb" || base === "nn" || base === "no" || base === "da") return "sv";
  }
  return "en";
}

export function stringsFor(locale: Locale): Strings {
  return STRINGS[locale];
}

/** "Missing {fields}" + { fields: "amount" } → "Missing amount". */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/** ["merchant", "amount", "date"] → "merchant, amount and date" (sv: "och", fr: "et"). */
export function joinList(items: string[], and: string): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}
