"use client";

import { RespondButtons } from "@/app/app/accountant/accept/RespondButtons";

export type PendingAccountantInvite = { id: string; firmName: string };

/**
 * On the receipts page: "Share your receipts with <firm>?" with Yes, share /
 * No thanks, so a client can answer an accounting firm's invite without finding
 * the email or Settings. Invites are matched to the signed-in, confirmed
 * address server-side (loadAccountantLinks); the answer goes through the
 * same POST /api/accountant/respond as the invite page.
 */
export function AccountantInviteNotice({
  invites,
  onDone,
}: {
  invites: PendingAccountantInvite[];
  onDone?: (status: "active" | "revoked") => void;
}) {
  if (invites.length === 0) return null;
  return (
    <div className="space-y-3 mb-6">
      {invites.map((inv) => (
        <section
          key={inv.id}
          aria-label={`Invite from ${inv.firmName}`}
          className="bg-card space-y-3"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
        >
          <div className="space-y-1">
            <h2 className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "18px", lineHeight: 1.3 }}>
              Share your receipts with {inv.firmName}?
            </h2>
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
              They&apos;ll see all your receipts and do your bookkeeping.
            </p>
          </div>
          <RespondButtons inviteId={inv.id} firmName={inv.firmName} showHomeLink={false} quietAccept onDone={onDone} />
        </section>
      ))}
    </div>
  );
}
