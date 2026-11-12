"use client";

import { useLayoutEffect } from "react";

/**
 * Keeps a marketing page light. The root layout marks the product host for
 * dark mode (data-theme="auto", and data-theme-default with the same value).
 * Local and preview addresses serve both surfaces from one host: a full page
 * load of a marketing path is caught before paint by the root layout's
 * inline script; this covers client navigations, removing the mark before
 * paint and putting the layout's value back when the page is left. On the
 * marketing apex nothing is ever set, so this does nothing there.
 */
export function LightOnly() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.removeAttribute("data-theme");
    return () => {
      const initial = html.getAttribute("data-theme-default");
      if (initial) html.setAttribute("data-theme", initial);
    };
  }, []);
  return null;
}
