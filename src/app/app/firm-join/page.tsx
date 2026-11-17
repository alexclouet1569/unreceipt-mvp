import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { Wordmark } from "@/components/brand/Wordmark";
import { findPendingFirmSeat, getFirmMembership } from "@/lib/require-firm";
import { checkMayJoinFirm } from "@/lib/account-roles";
import { JoinAnswer } from "./JoinAnswer";

export const dynamic = "force-dynamic";

// "<firm> added you to its team": where /app and /firm send a user whose
// confirmed address a firm added as staff. GET changes nothing; the answer
// POSTs /api/firm-join, the only place a waiting seat is claimed.

export default async function FirmJoinPage() {
  const user = await getServerUser();
  if (!user) redirect("/app/login?next=/app/firm-join");
  if (await getFirmMembership(user.id)) redirect("/firm");
  const seat = await findPendingFirmSeat(user);
  if (!seat) redirect("/app");
  // One account, one role (src/lib/account-roles.ts): a company account
  // can't join. On a failed read the Join route checks again.
  const canJoin = (await checkMayJoinFirm(user.id)) !== "blocked";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-[540px] mx-auto px-4 h-14 flex items-center">
          <Wordmark />
        </div>
      </header>
      <main className="max-w-[540px] mx-auto px-4 pt-16 pb-10">
        <div className="space-y-5">
          <div className="space-y-2">
            <h1 className="type-display-lg text-[var(--ink)]">
              {seat.firmName} added you to its team
            </h1>
            {canJoin ? (
              <p className="type-body text-[var(--ink-muted)]">
                Join to see the clients {seat.firmName} works with in the firm portal. If you don&apos;t work at{" "}
                {seat.firmName}, choose Not me: you&apos;ll use UnReceipt for your own receipts, and{" "}
                {seat.firmName} won&apos;t see them.
              </p>
            ) : (
              <p className="type-body text-[var(--ink-muted)]">
                This account is for a company&apos;s receipts, so it can&apos;t also work for an accounting firm. If
                you work at {seat.firmName}, ask them to add another email address of yours. {seat.firmName}{" "}
                doesn&apos;t see your receipts.
              </p>
            )}
          </div>
          <JoinAnswer firmName={seat.firmName} canJoin={canJoin} />
          {canJoin ? null : (
            <Link href="/app" className="inline-flex min-h-11 items-center type-body text-[var(--ink)] underline">
              Go to your receipts
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
