import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  buildForwardingAddress,
  getOrCreateAliasForUser,
} from "@/lib/email-alias";
import type { EmailForwardingConfirmation } from "@/lib/types";
import { ForwardingGuide, type GuideConfirmation } from "./ForwardingGuide";

// The setup guide for the forwarding address (launch plan actions 84–85):
// what the address does, and step-by-step rules for Gmail, Outlook and
// others. Like Settings, reachable without an active subscription.
export const dynamic = "force-dynamic";

// A Gmail code older than this is from an earlier attempt; don't offer it.
const CONFIRMATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function loadConfirmation(userId: string): Promise<GuideConfirmation | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("email_forwarding_confirmations")
    .select("code, for_address, received_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[/app/settings/forwarding] confirmation load failed", error);
    return null;
  }
  const row = data as Pick<EmailForwardingConfirmation, "code" | "for_address" | "received_at"> | null;
  if (!row || Date.now() - Date.parse(row.received_at) > CONFIRMATION_MAX_AGE_MS) return null;
  return { code: row.code, forAddress: row.for_address, receivedAt: row.received_at };
}

export default async function ForwardingPage() {
  const user = await getServerUser();
  if (!user) redirect("/app/login");

  const [aliasHash, confirmation] = await Promise.all([
    getOrCreateAliasForUser(user.id),
    loadConfirmation(user.id),
  ]);
  const forwardingEmail = aliasHash ? buildForwardingAddress(aliasHash) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link
            href="/app/settings"
            aria-label="Back to settings"
            className="inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors"
            style={{ width: "44px", height: "44px", borderRadius: "10px" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "18px", letterSpacing: "-0.01em" }}
          >
            Your receipts address
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {forwardingEmail ? (
          <ForwardingGuide forwardingEmail={forwardingEmail} confirmation={confirmation} />
        ) : (
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            Your forwarding address isn&apos;t ready yet. Reload this page in a
            moment.
          </p>
        )}
      </main>
    </div>
  );
}
