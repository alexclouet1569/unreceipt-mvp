"use client";

// The product language on the client. The server picks the locale
// (src/lib/i18n/server.ts) and passes only the string; every language's
// messages are bundled here because they hold functions, which can't cross
// from a server component. Without a provider (tests, /demo) it's English.

import { createContext, useContext, useEffect, useMemo } from "react";
import { getMessages, type Messages } from "./messages";
import { INTL_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./locale";

type I18n = { locale: Locale; t: Messages };

const I18nContext = createContext<I18n>({ locale: "en", t: getMessages("en") });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: getMessages(locale) }), [locale]);
  // The root layout can't know the product language; fix <html lang>.
  useEffect(() => {
    document.documentElement.lang = INTL_LOCALE[locale].slice(0, 2);
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** Saves the language choice for this device. Call router.refresh() after. */
export function saveLocale(locale: Locale): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}
