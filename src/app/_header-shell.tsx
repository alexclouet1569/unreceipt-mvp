"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The marketing header's only behaviour, kept apart so the header itself
 * stays plain server-rendered links.
 *
 * - `overHero`: the page starts with the green hero, so the bar is clear on
 *   top of it and turns cream once the page scrolls (or the menu opens).
 *   Otherwise it is cream from the first pixel.
 * - Closes the mobile menu (a native <details>) after a link in it is
 *   followed, on Escape, and on a click outside it, since in-page links
 *   (#how, #faq) don't leave the page.
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
    const menu = header?.querySelector("details");
    if (!header || !menu) return;
    const close = () => menu.removeAttribute("open");
    const onToggle = () => setMenuOpen(menu.open);
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest("details a")) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu.open) {
        close();
        menu.querySelector("summary")?.focus();
      }
    };
    // pointerdown, not click: iOS Safari sends no click for a tap on
    // something that isn't clickable.
    const onOutside = (e: PointerEvent) => {
      if (menu.open && !menu.contains(e.target as Node)) close();
    };
    // Tabbing out of the menu closes it, so focus never goes under it.
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (menu.open && next && !menu.contains(next)) close();
    };
    // The menu is hidden from 1024px up: close it so the bar doesn't stay cream.
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => {
      if (wide.matches) close();
    };
    menu.addEventListener("toggle", onToggle);
    menu.addEventListener("focusout", onFocusOut);
    header.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    wide.addEventListener("change", onWide);
    return () => {
      menu.removeEventListener("toggle", onToggle);
      menu.removeEventListener("focusout", onFocusOut);
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
