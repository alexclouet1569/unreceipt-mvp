/**
 * Product language (app.unreceipt.com). Pure — safe to import anywhere.
 *
 * The language is chosen per device: the `ur_locale` cookie set by the
 * switch in Settings, else the browser's Accept-Language, else English.
 * Reading it on the server: src/lib/i18n/server.ts.
 */

import { LOCALES, type Locale } from "@/lib/locale";

export type { Locale } from "@/lib/locale";

export const LOCALE_COOKIE = "ur_locale";
// A year: the choice is a preference, not a session.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** BCP 47 tag for Intl number and date formatting. */
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en-US",
  fr: "fr-FR",
  sv: "sv-SE",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best of our languages for an Accept-Language header
 * ("fr-FR,fr;q=0.9,en;q=0.8" → "fr"), or English.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return "en";
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q) : 1, index };
    })
    .filter((x) => x.lang && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { lang } of ranked) {
    // Norwegian and Danish readers get Swedish rather than English.
    const mapped = lang === "nb" || lang === "no" || lang === "nn" || lang === "da" ? "sv" : lang;
    if (isLocale(mapped)) return mapped;
  }
  return "en";
}

/** The locale for a request: saved choice first, then the browser's. */
export function resolveLocale(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  return isLocale(cookie) ? cookie : localeFromAcceptLanguage(acceptLanguage);
}
