import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Wordmark } from "@/components/brand/Wordmark";
import { hashInviteToken, isInviteExpired, isInviteTokenShape } from "@/lib/firm/invites";
import { InviteCard, type InviteView } from "./_invite-card";

export const dynamic = "force-dynamic";

// GET never changes anything: the invite is resolved by its token hash and
// shown with "Yes, share my receipts" / "No thanks" buttons, which POST /api/accountant/respond.
async function loadInvite(token: string | undefined): Promise<InviteView | null> {
  if (!isInviteTokenShape(token)) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select("id, status, client_name, invite_expires_at, firms(name)")
    .eq("invite_token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error || !data) return null;
  const firms = data.firms as { name: string } | { name: string }[] | null;
  const firmName = (Array.isArray(firms) ? firms[0] : firms)?.name ?? "Your accounting firm";
  const state: InviteView["state"] =
    data.status !== "invited"
      ? "used"
      : isInviteExpired(data.invite_expires_at as string | null)
        ? "expired"
        : "open";
  return { id: data.id as string, firmName, clientName: data.client_name as string, state };
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const user = await getServerUser();
  if (!user) {
    redirect(`/app/login?next=${encodeURIComponent(`/app/accountant/accept?token=${token ?? ""}`)}`);
  }
  const invite = await loadInvite(token);

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
