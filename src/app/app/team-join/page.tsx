import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { loginPath } from "@/app/auth/callback/safe-next";
import { Wordmark } from "@/components/brand/Wordmark";
import { findWaitingTeamInvites } from "@/lib/team/invites";
import { TeamJoinAnswer } from "./TeamJoinAnswer";

export const dynamic = "force-dynamic";

// "<company> added you to its team": the link in a team invite email (and
// the notice on /app). GET changes nothing; Join POSTs /api/team-join, the
// only place an invite becomes a membership (src/lib/team/invites.ts).

const H1 = { fontSize: "24px", lineHeight: 1.15, letterSpacing: "-0.02em" } as const;
const P = { fontSize: "15px", lineHeight: 1.5 } as const;

export default async function TeamJoinPage() {
  const user = await getServerUser();
  // The invite email says "You'll create a free account with this address
  // first": open Create account, then come back here.
  if (!user) redirect(loginPath("/app/team-join", { signup: true }));
  const invites = await findWaitingTeamInvites(user);
  if (invites.length === 0) redirect("/app");
  const invite = invites[0];

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
              {invite.companyName} added you to its team
            </h1>
            <p className="text-[var(--ink-muted)]" style={P}>
              Join to send your work receipts to {invite.companyName}: scan them, check them and send them for
              approval. {invite.companyName} sees the receipts you send, never anything else in your account.
              If you don&apos;t work at {invite.companyName}, choose Not me.
            </p>
            {invite.role === "approver" ? (
              <p className="text-[var(--ink-muted)]" style={P}>
                You&apos;ll also approve the receipts of colleagues assigned to you.
              </p>
            ) : null}
          </div>
          <TeamJoinAnswer inviteId={invite.id} companyName={invite.companyName} />
        </div>
      </main>
    </div>
  );
}
