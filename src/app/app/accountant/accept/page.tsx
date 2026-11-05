import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Wordmark } from "@/components/brand/Wordmark";
import { hashInviteToken, isInviteExpired, isInviteTokenShape } from "@/lib/firm/invites";
import { RespondButtons } from "./RespondButtons";

export const dynamic = "force-dynamic";

type InviteView = {
  id: string;
  firmName: string;
  clientName: string;
  state: "open" | "expired" | "used" | "missing";
};

// GET never changes anything: the invite is resolved by its token hash and
// shown with Connect / Not now buttons, which POST /api/accountant/respond.
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
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <Link href="/app" aria-label="UnReceipt">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-10">
        <div
          className="bg-card space-y-4"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "24px 20px" }}
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
              <RespondButtons inviteId={invite.id} token={token ?? ""} firmName={invite.firmName} />
            </>
          )}
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
            Signed in as {user.email ?? "your account"}.{" "}
            <Link href="/app/settings" className="underline">
              Settings
            </Link>
          </p>
        </div>
      </main>
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
      <Link href="/app" className="inline-block underline text-[var(--ink)]" style={{ fontSize: "14px" }}>
        Go to your receipts
      </Link>
    </>
  );
}
