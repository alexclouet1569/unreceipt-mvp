import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireAdminPage } from "@/lib/require-admin";

// Admin reads cookies + DB on every request — never cache.
export const dynamic = "force-dynamic";

/**
 * Layout for /admin/**. src/lib/host-proxy.ts is written to also gate
 * these paths (plan A2 defense in depth) but is not active yet (it never
 * ran as a root proxy.ts). requireAdminPage() in each /admin page and
 * requireAdmin() in each /api/admin handler are the only gate in
 * production; this layout check is a convenience (layouts don't re-run on
 * client navigations).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Receipt className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">UnReceipt Admin</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/admin/pilot" className="text-xs font-medium hover:text-foreground">
              Pilot
            </Link>
            <Link
              href="/app"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Customer view ↗
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
