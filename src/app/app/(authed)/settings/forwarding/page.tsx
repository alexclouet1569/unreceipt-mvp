import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
import {
  buildForwardingAddress,
  getOrCreateAliasForUser,
} from "@/lib/email-alias";
import { listExtraAddresses } from "@/lib/owner-addresses";
import { getI18n } from "@/lib/i18n/server";
import { ForwardingGuide } from "./ForwardingGuide";
import { OwnAddresses } from "./OwnAddresses";

// The setup guide for the forwarding address (launch plan actions 84–85):
// what the address does and a step-by-step wizard for Gmail, Outlook and
// others (it polls /api/forwarding/status for Gmail's code and the test
// email). Like Settings, reachable without an active subscription.
export const dynamic = "force-dynamic";


export default async function ForwardingPage() {
  const user = await getServerUser();
  if (!user) redirect("/app/login");

  const [{ t: messages }, aliasHash, extraAddresses] = await Promise.all([
    getI18n(),
    getOrCreateAliasForUser(user.id),
    listExtraAddresses(user.id),
  ]);
  const forwardingEmail = aliasHash ? buildForwardingAddress(aliasHash) : null;
  // No one-tap "add the Gmail that asked to forward here": anyone who knows
  // the alias can make Gmail send that email, naming their own address.

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link
            href="/app/settings"
            aria-label={messages.settings.forwarding.backToSettings}
            className="inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
            style={{ width: "44px", height: "44px", borderRadius: "10px" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "18px", letterSpacing: "-0.01em" }}
          >
            {messages.settings.forwarding.title}
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {forwardingEmail ? (
          <ForwardingGuide
            forwardingEmail={forwardingEmail}
            ownAddresses={
              <OwnAddresses
                accountEmail={user.email ?? null}
                addresses={extraAddresses}
              />
            }
          />
        ) : (
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            {messages.settings.page.notReady}
          </p>
        )}
      </main>
    </div>
  );
}
