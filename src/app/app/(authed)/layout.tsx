import { ViewTransition } from "react";
import { AppHeader, AppTabBar } from "@/components/AppNav";

/**
 * The signed-in product's frame (DESIGN.md "Layout", 2026-11-12): one
 * header with the wordmark (and the tabs from 640 px up), the page, and the
 * bottom tab bar below 640 px. Chrome only: every page still checks the
 * session itself (a layout doesn't re-run on client navigations).
 *
 * Moving between tabs crossfades through React's <ViewTransition> (the
 * `app-page` class in globals.css); browsers without view transitions just
 * switch pages, and so does reduced motion.
 */
export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {/* Only a tab change (a Link with the "tab" type) animates: a save's
          router.refresh() or a Suspense reveal never fades the page. */}
      <ViewTransition default="none" update={{ tab: "app-page", default: "none" }}>
        <main>{children}</main>
      </ViewTransition>
      <AppTabBar />
    </div>
  );
}
