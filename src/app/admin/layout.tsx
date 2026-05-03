import { redirect } from "next/navigation";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { AdminAuthError, requireAdmin } from "@/lib/require-admin";

// Admin reads cookies + DB on every request — never cache.
export const dynamic = "force-dynamic";

/**
 * Layout for /admin/**. The proxy.ts root middleware also gates these
 * paths (plan A2 defense in depth); requireAdmin() here is the
 * server-side re-check that actually protects the data.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminAuthError) {
      // Whether the caller is unauthenticated or just not an admin, the
      // safest bounce is back to /app — which itself redirects to
      // /app/login if there's no session.
      redirect("/app");
    }
    throw err;
  }

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
          <Link
            href="/app"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Customer view ↗
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
