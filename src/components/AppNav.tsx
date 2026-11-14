"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, Receipt, Settings, type LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * The product's navigation (DESIGN.md "Layout", 2026-11-12): the wordmark
 * in a compact header on every page, the tabs as links in that header from
 * 640 px up, and as a bottom bar below 640 px, where the thumb is. The
 * accounting-firm portal (/firm and its demo tour) uses the same two parts,
 * wider and with the firm's name next to the wordmark.
 */
export type NavTab = { href: string; label: string; icon: LucideIcon };

export const APP_TABS: NavTab[] = [
  { href: "/app", label: "Receipts", icon: Receipt },
  { href: "/app/insights", label: "Insights", icon: ChartColumn },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

/**
 * aria-current: "page" on the tab's own page, "true" on a page inside it.
 * `isPage` tells it when the path can't (the demo tour's query links).
 */
function current(
  href: string,
  active: string | null,
  pathname: string,
  isPage?: boolean,
): "page" | "true" | undefined {
  if (href !== active) return undefined;
  return (isPage ?? pathname === href) ? "page" : "true";
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
  homeLabel = "UnReceipt, your receipts",
  wide = false,
  subtitle,
  activeHref,
  activeIsPage,
}: {
  tabs?: NavTab[];
  /** Where the wordmark leads: the demo tour keeps it inside the tour. */
  homeHref?: string;
  homeLabel?: string;
  /** The firm portal's 1040 px width instead of the app's 540 px. */
  wide?: boolean;
  /** Shown next to the wordmark from 640 px up (the firm's name). */
  subtitle?: string;
  /** The current tab when the path can't tell (the demo tour's query links). */
  activeHref?: string | null;
  /** With activeHref: whether this is the tab's own page or one inside it. */
  activeIsPage?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const active = activeHref !== undefined ? activeHref : activeTab(pathname, tabs);
  return (
    // Named for the tab crossfade, so it stays put above the fading page.
    <header style={{ viewTransitionName: "app-header" }} className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-background/90 backdrop-blur-md">
      <div className={`mx-auto flex h-14 items-center justify-between gap-4 px-4 ${wide ? "max-w-[1040px]" : "max-w-[540px]"}`}>
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href={homeHref}
            aria-label={homeLabel}
            className="inline-flex h-11 shrink-0 items-center rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Wordmark />
          </Link>
          {subtitle ? (
            <span className="hidden truncate type-caption text-[var(--ink-muted)] sm:inline">{subtitle}</span>
          ) : null}
        </div>
        {tabs.length > 0 ? (
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {tabs.map((t) => {
              const isActive = t.href === active;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  transitionTypes={["tab"]}
                  aria-current={current(t.href, active, pathname, activeIsPage)}
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
export function AppTabBar({
  tabs = APP_TABS,
  wide = false,
  activeHref,
  activeIsPage,
}: {
  tabs?: NavTab[];
  wide?: boolean;
  activeHref?: string | null;
  activeIsPage?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const active = activeHref !== undefined ? activeHref : activeTab(pathname, tabs);
  return (
    <nav
      aria-label="Main"
      data-app-tabbar=""
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-background sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", viewTransitionName: "app-tabbar" }}
    >
      <ul className={`mx-auto flex h-14 ${wide ? "max-w-[1040px]" : "max-w-[540px]"}`}>
        {tabs.map((t) => {
          const isActive = t.href === active;
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                transitionTypes={["tab"]}
                aria-current={current(t.href, active, pathname, activeIsPage)}
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
