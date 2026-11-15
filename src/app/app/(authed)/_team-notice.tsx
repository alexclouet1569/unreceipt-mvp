import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { MobileTeam } from "@/lib/mobile/types";
import type { WaitingTeamInvite } from "@/lib/team/invites";

// Above the receipts on /app (2026-11-15): a team invite waiting for this
// address ("Join"), or receipts waiting for the person's decision. A hairline
// card like Settings' rows: no green, the scan button stays the page's one.

export function TeamNotice({ team, invites }: { team: MobileTeam | null; invites: WaitingTeamInvite[] }) {
  const invite = team === null || team.role === "owner" ? invites[0] : undefined;
  const toApprove = team && team.role !== "member" ? team.toApprove : 0;
  if (!invite && toApprove === 0) return null;
  const rows = [
    ...(invite
      ? [
          {
            href: "/app/team-join",
            title: `${invite.companyName} added you to its team`,
            body: "Join to send your work receipts for approval. Only if you work there.",
          },
        ]
      : []),
    ...(toApprove > 0
      ? [
          {
            href: "/app/team",
            title: toApprove === 1 ? "1 receipt to approve" : `${toApprove} receipts to approve`,
            body: "Approve, send back or reject what your colleagues sent.",
          },
        ]
      : []),
  ];
  return (
    <div className="mx-auto max-w-[640px] space-y-2 px-4 pt-4">
      {rows.map((row) => (
      <Link
        key={row.href}
        href={row.href}
        className="flex items-center justify-between gap-3 bg-card hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
        style={{ border: "1px solid var(--hairline)", borderLeft: "3px solid var(--attention)", borderRadius: "12px", padding: "12px 14px" }}
        data-testid="team-notice"
      >
        <span className="min-w-0">
          <span className="block text-[var(--ink)] [overflow-wrap:anywhere]" style={{ fontSize: "15px", fontWeight: 600 }}>
            {row.title}
          </span>
          <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
            {row.body}
          </span>
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
      </Link>
      ))}
    </div>
  );
}
