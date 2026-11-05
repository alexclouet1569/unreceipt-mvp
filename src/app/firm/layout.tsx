import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { requireFirmMemberPage } from "@/lib/require-firm";
import { hasAnyMembership } from "@/lib/organizations";
import { FirmNav } from "./_nav";

// The gate reads cookies + DB on every request — never cache.
export const dynamic = "force-dynamic";

/**
 * Layout for /firm/**: the accounting-firm portal. requireFirmMemberPage()
 * here is the first check; every page under /firm calls it again because
 * layouts don't re-run on client navigations.
 *
 * Desktop-first on purpose (DESIGN.md decisions log, 2026-11-04):
 * accountants work on laptops, so this surface allows a 1040px width and
 * data tables. Tokens, fonts and hairline cards are the product's.
 */
export default async function FirmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireFirmMemberPage();
  const alsoCustomer = await hasAnyMembership(ctx.user.id);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-[1040px] mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/firm/clients" aria-label="UnReceipt for firms">
            <Wordmark />
          </Link>
          <span
            className="hidden sm:inline truncate text-[var(--ink-muted)]"
            style={{ fontSize: "14px" }}
          >
            {ctx.firmName}
          </span>
          <FirmNav alsoCustomer={alsoCustomer} />
        </div>
      </header>

      <main className="max-w-[1040px] mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
