// "Share your receipts with <firm>?" — one question, two buttons. Shared by
// /app/accountant/accept (real invite, checked server-side) and the public
// demo tour at /demo/company.

import Link from "next/link";
import { SignOutButton } from "@/app/app/(authed)/settings/SignOutButton";
import { RespondButtons } from "./RespondButtons";

export type InviteView = {
  id: string;
  firmName: string;
  clientName: string;
  state: "open" | "expired" | "used" | "missing" | "wrong_account";
  // For "wrong_account": the invited address with most of it hidden.
  maskedEmail?: string;
};

/** "m•••@nordljusdesign.se": enough to recognise, not to harvest. */
export function maskEmail(address: string): string {
  const [local, domain] = address.split("@");
  if (!local || !domain) return "another address";
  return `${local[0]}•••@${domain}`;
}

export function InviteCard({
  invite,
  token,
  email,
}: {
  invite: InviteView | null;
  token: string;
  // Shown so someone signed in to another account doesn't share it by mistake.
  email: string | null;
}) {
  if (!invite || invite.state === "missing") {
    return <Notice title="This link doesn't work">Ask your accountant to send a new invite.</Notice>;
  }
  if (invite.state === "expired") {
    return <Notice title="This link is too old">Ask {invite.firmName} to send a new invite.</Notice>;
  }
  if (invite.state === "wrong_account") {
    return (
      <div className="space-y-3">
        <Notice title="Sign in with the invited address" home={false}>
          This invite was sent to {invite.maskedEmail ?? "another address"}. Sign out, then open the
          link in the email again and sign in with that address.
        </Notice>
        <SignOutButton />
      </div>
    );
  }
  if (invite.state === "used") {
    return <Notice title="Already answered">You can change it any time in Settings.</Notice>;
  }
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1
          className="font-display font-bold text-[var(--ink)]"
          style={{ fontSize: "24px", lineHeight: 1.15, letterSpacing: "-0.02em" }}
        >
          Share your receipts with {invite.firmName}?
        </h1>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
          They&apos;ll see all your receipts and do your bookkeeping.
        </p>
      </div>
      <RespondButtons inviteId={invite.id} token={token} firmName={invite.firmName} />
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.4 }}>
        For {invite.clientName}
        {email ? ` · signed in as ${email}` : ""}
      </p>
    </div>
  );
}

function Notice({
  title,
  children,
  home = true,
}: {
  title: string;
  children: React.ReactNode;
  home?: boolean;
}) {
  return (
    <div className="space-y-2">
      <h1
        className="font-display font-bold text-[var(--ink)]"
        style={{ fontSize: "24px", lineHeight: 1.15, letterSpacing: "-0.02em" }}
      >
        {title}
      </h1>
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
        {children}
      </p>
      {home ? (
        <Link href="/app" className="inline-flex items-center min-h-11 underline text-[var(--ink)]" style={{ fontSize: "15px" }}>
          Go to your receipts
        </Link>
      ) : null}
    </div>
  );
}
