"use client";

import { useEffect } from "react";

/**
 * Sets `<html lang>` for a page whose language isn't the root layout's
 * English. The root layout can't see the pathname, so the page fixes it
 * after hydration; search engines get the language from the hreflang
 * tags and the content, which are in the server HTML.
 */
export function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.lang;
    html.lang = lang;
    return () => {
      html.lang = previous;
    };
  }, [lang]);
  return null;
}
