/**
 * Marketing-site languages. English lives at `/`, Swedish at `/sv`,
 * French at `/fr`. The product (app.unreceipt.com) is English only for now.
 *
 * Pure data, safe to import from client components.
 */

export type Locale = "en" | "sv" | "fr";

export const LOCALES: readonly Locale[] = ["en", "sv", "fr"];

/** Path of each language's landing page. */
export const LOCALE_HOME: Record<Locale, string> = { en: "/", sv: "/sv", fr: "/fr" };

/** Each language's name in that language, for the language switch. */
export const LOCALE_NAME: Record<Locale, { label: string; short: string }> = {
  en: { label: "English", short: "EN" },
  sv: { label: "Svenska", short: "SV" },
  fr: { label: "Français", short: "FR" },
};
