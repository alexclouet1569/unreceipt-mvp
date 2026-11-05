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
          The invite may have been withdrawn, or the link was copied
          incorrectly. Ask your accounting firm to send it again, or check
          Settings → Your accountant if an invite is waiting there.
        </Notice>
      ) : invite.state === "expired" ? (
        <Notice title="This link has expired">
          Invite links work for 14 days. Ask {invite.firmName} to send a
          new one.
        </Notice>
      ) : invite.state === "used" ? (
        <Notice title="Already answered">
          This invite has already been accepted or declined. Your current
          connection is under Settings → Your accountant.
        </Notice>
      ) : (
        <>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "22px", letterSpacing: "-0.01em" }}
          >
            Connect {invite.firmName}?
          </h1>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.6 }}>
            {invite.firmName} asked to handle the receipts of{" "}
            <span className="text-[var(--ink)] font-medium">{invite.clientName}</span>.
            Once connected they can see your receipts and originals, fill in
            the ones that need review, and download a monthly export for your
            bookkeeping. They can&apos;t change your plan or delete anything.
            You can disconnect them any time in Settings.
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
