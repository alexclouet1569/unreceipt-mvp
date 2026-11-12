"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, Receipt, Settings, type LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * The product's navigation (DESIGN.md "Layout", 2026-11-12): the wordmark
 * in a compact header on every page, the tabs as links in that header from
 * 640 px up, and as a bottom bar below 640 px, where the thumb is.
 */
export type NavTab = { href: string; label: string; icon: LucideIcon };

export const APP_TABS: NavTab[] = [
  { href: "/app", label: "Receipts", icon: Receipt },
  { href: "/app/insights", label: "Insights", icon: ChartColumn },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

/** aria-current: "page" on the tab's own page, "true" on a page inside it. */
function current(href: string, active: string | null, pathname: string): "page" | "true" | undefined {
  if (href !== active) return undefined;
  return pathname === href ? "page" : "true";
}

/** The tab a path belongs to: the longest tab href it starts with. */
export function activeTab(
  pathname: string,
  tabs: NavTab[] = APP_TABS,
): string | null {
  let best: string | null = null;
  for (const t of tabs) {
    const match = pathname === t.href || pathname.startsWith(`${t.href}/`);
    if (match && (best == null || t.href.length > best.length)) best = t.href;
  }
  return best;
}

export function AppHeader({
  tabs = APP_TABS,
  homeHref = "/app",
}: {
  tabs?: NavTab[];
  /** Where the wordmark leads: the demo tour keeps it inside the tour. */
  homeHref?: string;
}) {
  const pathname = usePathname() ?? "";
  const active = activeTab(pathname, tabs);
  return (
    // Named for the tab crossfade, so it stays put above the fading page.
    <header style={{ viewTransitionName: "app-header" }} className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[540px] items-center justify-between px-4">
        <Link
          href={homeHref}
          aria-label="UnReceipt, your receipts"
          className="inline-flex h-11 items-center rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Wordmark />
        </Link>
        {tabs.length > 0 ? (
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {tabs.map((t) => {
              const isActive = t.href === active;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  transitionTypes={["tab"]}
                  aria-current={current(t.href, active, pathname)}
                  className={
                    // Current tab: ink with a 2 px ink rule on the header's
                    // hairline; colour alone was too close to the muted links.
                    "-mb-px inline-flex h-14 items-center border-b-2 px-3 text-[14px] font-semibold outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] " +
                    (isActive
                      ? "border-[var(--ink)] text-[var(--ink)]"
                      : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]")
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Below 640 px: the tabs at the bottom, above the home indicator. Ink for the
 * current tab and muted for the others, so the screen's one green stays the
 * capture button.
 */
export function AppTabBar({ tabs = APP_TABS }: { tabs?: NavTab[] }) {
  const pathname = usePathname() ?? "";
  const active = activeTab(pathname, tabs);
  return (
    <nav
      aria-label="Main"
      data-app-tabbar=""
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-background sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", viewTransitionName: "app-tabbar" }}
    >
      <ul className="mx-auto flex h-14 max-w-[540px]">
        {tabs.map((t) => {
          const isActive = t.href === active;
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                transitionTypes={["tab"]}
                aria-current={current(t.href, active, pathname)}
                className={
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] " +
                  (isActive ? "text-[var(--ink)]" : "text-[var(--ink-muted)]")
                }
              >
                <Icon
                  aria-hidden="true"
                  className="h-[22px] w-[22px]"
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
