import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { loginPath } from "@/app/auth/callback/safe-next";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizedSessionEmail } from "@/lib/email-address";
import { Wordmark } from "@/components/brand/Wordmark";
import { hashInviteToken, isInviteExpired, isInviteTokenShape } from "@/lib/firm/invites";
import type { User } from "@supabase/supabase-js";
import { InviteCard, maskEmail, type InviteView } from "./_invite-card";

export const dynamic = "force-dynamic";

// The invite token is in this page's URL: links and requests from it send
// only our origin as referrer, so the token never reaches analytics or
// another page (src/lib/tracking/scrub.ts).
export const metadata: Metadata = { referrer: "strict-origin" };

// GET never changes anything: the invite is resolved by its token hash and
// shown with "Yes, share" / "No thanks" buttons, which POST
// /api/accountant/respond. Only the invited address, signed in and
// confirmed, gets the buttons; anyone else sees "wrong_account".
async function loadInvite(token: string | undefined, user: User): Promise<InviteView | null> {
  if (!isInviteTokenShape(token)) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select("id, status, direction, client_name, invited_email, invite_expires_at, firms(name)")
    .eq("invite_token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error || !data || data.direction !== "firm") return null;
  const firms = data.firms as { name: string } | { name: string }[] | null;
  const firmName = (Array.isArray(firms) ? firms[0] : firms)?.name ?? "Your accounting firm";
  const invitedEmail = data.invited_email as string;
  // Normalised like the stored invite address (Gmail dots, googlemail.com).
  const signedInAs = normalizedSessionEmail(user);
  const state: InviteView["state"] =
    data.status !== "invited"
      ? "used"
      : isInviteExpired(data.invite_expires_at as string | null)
        ? "expired"
        : signedInAs !== invitedEmail
          ? "wrong_account"
          : "open";
  return {
    id: data.id as string,
    firmName,
    clientName: data.client_name as string,
    state,
    maskedEmail: state === "wrong_account" ? maskEmail(invitedEmail) : undefined,
  };
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const user = await getServerUser();
  if (!user) {
    // New to UnReceipt, most likely: the invite email says "You'll create a
    // free account first". Create account, then back here.
    redirect(loginPath(`/app/accountant/accept?token=${token ?? ""}`, { signup: true }));
  }
  const invite = await loadInvite(token, user);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-[540px] mx-auto px-4 h-14 flex items-center">
          <Link href="/app" aria-label="UnReceipt">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main className="max-w-[540px] mx-auto px-4 pt-16 pb-10">
        <InviteCard invite={invite} token={token ?? ""} email={user.email ?? null} />
      </main>
    </div>
  );
}
