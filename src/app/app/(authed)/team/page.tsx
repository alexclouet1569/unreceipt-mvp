import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getServerUser } from "@/lib/supabase-server";
import { teamContextFor } from "@/lib/team/membership";
import { loadApprovalQueue, loadReimbursements } from "@/lib/team/decisions";
import { loadTeamView } from "@/lib/team/invites";
import type { ApprovalQueueItem, ReimbursementGroup } from "@/lib/mobile/types";
import { ApprovalList } from "./ApprovalList";
import { PayBackList } from "./PayBackList";
import { TeamManager } from "./TeamManager";

export const dynamic = "force-dynamic";

// The team page (2026-11-15, src/lib/team/): receipts waiting for the
// signed-in owner's or approver's decision, approved outlays to pay back
// (owners), and the team itself (owners: invite, roles, approvers). An
// employee without anyone to approve has nothing here and goes to /app.

export default async function TeamPage() {
  const user = await getServerUser();
  if (!user) redirect("/app/login?next=/app/team");

  let role: string | null = null;
  try {
    role = (await teamContextFor(user.id))?.role ?? null;
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "team" } });
  }
  if (role === "member") redirect("/app");

  const owner = role === "owner";
  const [queue, payBack, team] = await Promise.all([
    loadApprovalQueue(user.id).catch((err): ApprovalQueueItem[] | null => {
      console.error("[/app/team] queue failed", err instanceof Error ? err.message : "unknown");
      return null;
    }),
    owner ? loadReimbursements(user.id) : Promise.resolve(null),
    owner ? loadTeamView(user.id) : Promise.resolve(null),
  ]);
  const groups: ReimbursementGroup[] | null = payBack && payBack.ok ? payBack.value : null;

  return (
    <div>
      <div className="mx-auto max-w-[640px] space-y-8 px-4 py-6 max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+88px)]">
        <div className="space-y-1">
          <h1 className="type-display-lg text-[var(--ink)]">Team</h1>
          {team && team.ok ? (
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px" }}>
              {team.value.companyName}
            </p>
          ) : null}
        </div>

        <section aria-labelledby="approve-heading" className="space-y-3">
          <SectionLabel id="approve-heading">To approve</SectionLabel>
          {queue === null ? (
            <Notice>Couldn&apos;t load the receipts to approve. Reload the page.</Notice>
          ) : (
            <ApprovalList items={queue} />
          )}
        </section>

        {owner ? (
          <section aria-labelledby="payback-heading" className="space-y-3">
            <SectionLabel id="payback-heading">To pay back</SectionLabel>
            {groups === null ? (
              <Notice>Couldn&apos;t load what to pay back. Reload the page.</Notice>
            ) : (
              <PayBackList groups={groups} />
            )}
          </section>
        ) : null}

        {owner ? (
          <section aria-labelledby="people-heading" className="space-y-3">
            <SectionLabel id="people-heading">People</SectionLabel>
            {team && team.ok ? (
              <TeamManager view={team.value} />
            ) : (
              <Notice>Couldn&apos;t load your team. Reload the page.</Notice>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="uppercase text-[var(--ink-muted)]"
      style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}
    >
      {children}
    </h2>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm font-semibold text-[var(--attention-deep)] bg-[var(--attention-tint)] rounded-md px-3 py-2">
      {children}
    </p>
  );
}
