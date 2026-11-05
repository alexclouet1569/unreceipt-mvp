import { requireFirmMemberPage } from "@/lib/require-firm";
import { hasAnyMembership } from "@/lib/organizations";
import { FirmNav } from "./_nav";
import { FirmShell } from "./_views";

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
    <FirmShell
      firmName={ctx.firmName}
      homeHref="/firm/clients"
      nav={<FirmNav alsoCustomer={alsoCustomer} />}
    >
      {children}
    </FirmShell>
  );
}
