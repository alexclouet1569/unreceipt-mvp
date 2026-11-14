import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { Wordmark } from "@/components/brand/Wordmark";
import { findPendingFirmSeat, getFirmMembership } from "@/lib/require-firm";
import { JoinAnswer } from "./JoinAnswer";

export const dynamic = "force-dynamic";

// "<firm> added you to its team": where /app and /firm send a user whose
// confirmed address a firm added as staff. GET changes nothing; the answer
// POSTs /api/firm-join, the only place a waiting seat is claimed.

const H1 = { fontSize: "24px", lineHeight: 1.15, letterSpacing: "-0.02em" } as const;
const P = { fontSize: "15px", lineHeight: 1.5 } as const;

export default async function FirmJoinPage() {
  const user = await getServerUser();
  if (!user) redirect("/app/login?next=/app/firm-join");
  if (await getFirmMembership(user.id)) redirect("/firm");
  const seat = await findPendingFirmSeat(user);
  if (!seat) redirect("/app");

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
            <h1 className="font-display font-bold text-[var(--ink)]" style={H1}>
              {seat.firmName} added you to its team
            </h1>
            <p className="text-[var(--ink-muted)]" style={P}>
              Join to see the clients {seat.firmName} works with in the firm portal. If you don&apos;t work at{" "}
              {seat.firmName}, choose Not me: you&apos;ll use UnReceipt for your own receipts, and{" "}
              {seat.firmName} won&apos;t see them.
            </p>
          </div>
          <JoinAnswer firmName={seat.firmName} />
        </div>
      </main>
    </div>
  );
}
