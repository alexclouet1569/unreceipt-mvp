// The "Connect your accounting firm?" card, shared by
// /app/accountant/accept (real invite, checked server-side) and the preview
// demo at /demo/firm.

import Link from "next/link";
import { RespondButtons } from "./RespondButtons";

export type InviteView = {
  id: string;
  firmName: string;
  clientName: string;
  state: "open" | "expired" | "used" | "missing";
};

export function InviteCard({
  invite,
  token,
  email,
}: {
  invite: InviteView | null;
  token: string;
  email: string | null;
}) {
  return (
    <div
      className="bg-card space-y-4"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px 14px" }}
    >
      {!invite || invite.state === "missing" ? (
        <Notice title="This link doesn't work">
          Ask your accountant to send a new invite.
        </Notice>
      ) : invite.state === "expired" ? (
        <Notice title="This link is too old">
          Invite links work for 14 days. Ask {invite.firmName} to send a
          new one.
        </Notice>
      ) : invite.state === "used" ? (
        <Notice title="Already done">
          You already answered this invite. To change it, go to Settings →
          Your accountant.
        </Notice>
      ) : (
        <>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "22px", letterSpacing: "-0.01em" }}
          >
            Share your receipts with {invite.firmName}?
          </h1>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.6 }}>
            Your accountant wants to see the receipts of{" "}
            <span className="text-[var(--ink)] font-medium">{invite.clientName}</span>.
            Say yes, and they see all your receipts, old and new, and can
            fill in missing details for your bookkeeping. New receipts reach
            them automatically. They can&apos;t delete anything, and you can
            stop any time.
          </p>
          <RespondButtons inviteId={invite.id} token={token} firmName={invite.firmName} />
        </>
      )}
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
        Signed in as {email ?? "your account"}.{" "}
        <Link href="/app/settings" className="underline">
          Settings
        </Link>
      </p>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "20px" }}>
        {title}
      </h1>
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.6 }}>
        {children}
      </p>
      <Link href="/app" className="inline-flex items-center min-h-11 underline text-[var(--ink)]" style={{ fontSize: "15px" }}>
        Go to your receipts
      </Link>
    </>
  );
}
