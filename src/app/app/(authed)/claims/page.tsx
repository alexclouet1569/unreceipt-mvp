import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
import { hasProductAccess } from "@/lib/subscription-gate";
import { parseClaimMonth, shiftMonth } from "@/lib/claims/claim";
import { ClaimTooLargeError, loadClaim, type ClaimData } from "@/lib/claims/claim-data";
import { ClaimSheet } from "./ClaimSheet";

// Reads the session and the month's receipts on every request.
export const dynamic = "force-dynamic";

type ClaimsPageProps = {
  searchParams: Promise<{ month?: string }>;
};

function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export default async function ClaimsPage({ searchParams }: ClaimsPageProps) {
  const user = await getServerUser();
  if (!user) redirect("/app/login");
  if (!(await hasProductAccess(user.id))) redirect("/subscribe");

  const { month: monthParam } = await searchParams;
  const month = parseClaimMonth(monthParam) ?? currentMonth();

  let data: ClaimData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadClaim(user.id, month);
  } catch (err) {
    if (err instanceof ClaimTooLargeError) {
      loadError = "This month has too many receipts to show as one claim.";
    } else {
      Sentry.captureException(err, { tags: { area: "/app/claims load" } });
      console.error("[/app/claims] load failed", err instanceof Error ? err.message : "unknown");
      loadError = "Couldn't load this month's receipts. Reload the page to try again.";
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link
            href="/app"
            aria-label="Back to receipts"
            className="inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors duration-100 outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            style={{ width: "44px", height: "44px", borderRadius: "10px" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "18px", letterSpacing: "-0.01em" }}
          >
            Expense claim
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <ClaimSheet
          // A new month starts from its own saved values.
          key={month}
          month={month}
          prevMonth={shiftMonth(month, -1)}
          nextMonth={shiftMonth(month, 1)}
          receipts={data?.rows ?? []}
          history={data?.history ?? []}
          loadError={loadError}
        />
      </main>
    </div>
  );
}
