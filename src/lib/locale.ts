/**
 * Marketing-site languages. English lives at `/`, Swedish at `/sv`.
 * The product (app.unreceipt.com) is English only for now.
 *
 * Pure data, safe to import from client components.
 */

export type Locale = "en" | "sv";

/** Path of each language's landing page. */
export const LOCALE_HOME: Record<Locale, string> = { en: "/", sv: "/sv" };

