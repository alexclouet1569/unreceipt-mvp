"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The marketing header's only behaviour, kept apart so the header itself
 * stays plain server-rendered links.
 *
 * - `overHero`: the page starts with the green hero, so the bar is clear on
 *   top of it and turns cream once the page scrolls (or the menu opens).
 *   Otherwise it is cream from the first pixel.
 * - Closes the mobile menu and the language menu (native <details>) after a
 *   link in one is followed (in-page links like #how don't leave the page),
 *   on Escape, on a tap outside and when focus tabs out.
 */
export function HeaderShell({
  overHero,
  children,
}: {
  overHero: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!overHero) return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overHero]);

  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    // The mobile menu ([data-menu]) and the language menu ([data-popover]).
    const all = () => [...header.querySelectorAll<HTMLDetailsElement>("details")];
    const menu = header.querySelector<HTMLDetailsElement>("details[data-menu]");
    const close = (d: HTMLDetailsElement) => d.removeAttribute("open");
    const onToggle = (e: Event) => {
      const d = e.target as HTMLDetailsElement;
      // One open at a time.
      if (d.open) all().forEach((o) => o !== d && close(o));
      if (d === menu) setMenuOpen(d.open);
    };
    const onClick = (e: MouseEvent) => {
      const d = (e.target as Element).closest("a")?.closest("details");
      if (d) close(d as HTMLDetailsElement);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const d of all()) {
        if (d.open) {
          close(d);
          d.querySelector("summary")?.focus();
        }
      }
    };
    // pointerdown, not click: iOS Safari sends no click for a tap on
    // something that isn't clickable.
    const onOutside = (e: PointerEvent) => {
      for (const d of all()) if (d.open && !d.contains(e.target as Node)) close(d);
    };
    // Tabbing out of a menu closes it, so focus never goes under it.
    const onFocusOut = (e: FocusEvent) => {
      const d = (e.target as Element).closest("details");
      const next = e.relatedTarget as Node | null;
      if (d?.open && next && !d.contains(next)) close(d);
    };
    // The mobile menu is hidden from 1024px up, the language menu below:
    // close both so the bar doesn't stay cream.
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => all().forEach(close);
    header.addEventListener("toggle", onToggle, true);
    header.addEventListener("focusout", onFocusOut);
    header.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    wide.addEventListener("change", onWide);
    return () => {
      header.removeEventListener("toggle", onToggle, true);
      header.removeEventListener("focusout", onFocusOut);
      header.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
      wide.removeEventListener("change", onWide);
    };
  }, []);

  // The page's own focus and anchor scrolling keep clear of the 72px bar
  // (globals.css sets 64px for the product's 56px header).
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.scrollPaddingTop;
    html.style.scrollPaddingTop = "80px";
    return () => {
      html.style.scrollPaddingTop = before;
    };
  }, []);

  const solid = !overHero || scrolled || menuOpen;

  return (
    <header
      ref={ref}
      data-solid={solid}
      className={
        "group/hdr fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300 " +
        (solid
          ? "bg-[#FAFAF7]/95 backdrop-blur-md border-[#E8E5DD]"
          : "bg-transparent border-transparent")
      }
    >
      {children}
    </header>
  );
}
