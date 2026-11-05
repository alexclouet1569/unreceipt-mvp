import Link from "next/link";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Wordmark } from "@/components/brand/Wordmark";
import { SignOutButton } from "@/app/app/(authed)/settings/SignOutButton";
import { hashInviteToken, isInviteExpired, isInviteTokenShape } from "@/lib/firm/invites";
import { resolveFirmMembership } from "@/lib/require-firm";
import { maskEmail } from "@/app/app/accountant/accept/_invite-card";
import { RequestAnswer } from "./RequestAnswer";

export const dynamic = "force-dynamic";

// The accountant's side of a client company's invite (direction 'client').
// GET changes nothing; answering POSTs /api/firm-request/respond. Only the
// invited address, signed in and confirmed, gets the buttons.

type View =
  | { state: "missing" | "expired" | "used" }
  | { state: "wrong_account"; masked: string }
  | { state: "open"; id: string; clientName: string; firmName: string | null };

async function load(token: string | undefined, user: User): Promise<View> {
  if (!isInviteTokenShape(token)) return { state: "missing" };
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select("id, status, direction, client_name, invited_email, invite_expires_at")
    .eq("invite_token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error || !data || data.direction !== "client") return { state: "missing" };
  if (data.status !== "invited") return { state: "used" };
  if (isInviteExpired(data.invite_expires_at as string | null)) return { state: "expired" };
  const signedInAs =
    typeof user.email === "string" && user.email_confirmed_at ? user.email.trim().toLowerCase() : null;
  if (signedInAs !== data.invited_email) {
    return { state: "wrong_account", masked: maskEmail(data.invited_email as string) };
  }
  const membership = await resolveFirmMembership(user);
  return {
    state: "open",
    id: data.id as string,
    clientName: data.client_name as string,
    firmName: membership?.firmName ?? null,
  };
}

const H1 = { fontSize: "24px", lineHeight: 1.15, letterSpacing: "-0.02em" } as const;
const P = { fontSize: "15px", lineHeight: 1.5 } as const;

export default async function FirmRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const user = await getServerUser();
  if (!user) {
    redirect(`/app/login?next=${encodeURIComponent(`/app/firm-request?token=${token ?? ""}`)}`);
  }
  const view = await load(token, user);

  let body: React.ReactNode;
  if (view.state === "open") {
    body = (
      <div className="space-y-5">
        <div className="space-y-2">
          <h1 className="font-display font-bold text-[var(--ink)]" style={H1}>
            {view.clientName} wants to share their receipts with you
          </h1>
          <p className="text-[var(--ink-muted)]" style={P}>
            {view.firmName
              ? `Accept, and ${view.clientName} joins ${view.firmName}'s clients.`
              : "Accept, and you'll see all their receipts, ready for your bookkeeping. Free for accounting firms."}
          </p>
        </div>
        <RequestAnswer inviteId={view.id} clientName={view.clientName} needsFirm={view.firmName === null} />
      </div>
    );
  } else if (view.state === "wrong_account") {
    body = (
      <div className="space-y-3">
        <h1 className="font-display font-bold text-[var(--ink)]" style={H1}>
          Sign in with the invited address
        </h1>
        <p className="text-[var(--ink-muted)]" style={P}>
          This invite was sent to {view.masked}. Sign out, then open the link in the email again and sign in with that
          address.
        </p>
        <SignOutButton />
      </div>
    );
  } else {
    const copy = {
      missing: ["This link doesn't work", "Ask your client to send a new invite."],
      expired: ["This link is too old", "Ask your client to send a new invite."],
      used: ["Already answered", "Your clients are in the firm portal."],
    }[view.state];
    body = (
      <div className="space-y-2">
        <h1 className="font-display font-bold text-[var(--ink)]" style={H1}>
          {copy[0]}
        </h1>
        <p className="text-[var(--ink-muted)]" style={P}>
          {copy[1]}
        </p>
        <Link href="/firm" className="inline-flex items-center min-h-11 underline text-[var(--ink)]" style={P}>
          Open the firm portal
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-[540px] mx-auto px-4 h-14 flex items-center">
          <Wordmark />
        </div>
      </header>
      <main className="max-w-[540px] mx-auto px-4 pt-16 pb-10">{body}</main>
    </div>
  );
}
