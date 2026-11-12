import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
import {
  buildForwardingAddress,
  getOrCreateAliasForUser,
} from "@/lib/email-alias";
import { listExtraAddresses } from "@/lib/owner-addresses";
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

  const [aliasHash, extraAddresses] = await Promise.all([
    getOrCreateAliasForUser(user.id),
    listExtraAddresses(user.id),
  ]);
  const forwardingEmail = aliasHash ? buildForwardingAddress(aliasHash) : null;
  // No one-tap "add the Gmail that asked to forward here": anyone who knows
  // the alias can make Gmail send that email, naming their own address.

  return (
    // The header and tabs come from the (authed) layout (AppNav); this
    // page is a step inside Settings, so it starts with the way back.
    <div>
      <div className="mx-auto max-w-[540px] px-4 py-4 max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+88px)]">
        <Link
          href="/app/settings"
          className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[10px] px-2 text-[14px] font-semibold text-[var(--ink-muted)] outline-none transition-colors hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Settings
        </Link>
        <h1 className="mt-1 mb-6 type-display-lg text-[var(--ink)]">Your receipts address</h1>
        {forwardingEmail ? (
          <ForwardingGuide
            forwardingEmail={forwardingEmail}
            accountEmail={user.email ?? null}
            ownAddresses={
              <OwnAddresses
                accountEmail={user.email ?? null}
                addresses={extraAddresses}
              />
            }
          />
        ) : (
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            Your forwarding address isn&apos;t ready yet. Reload this page in a
            moment.
          </p>
        )}
      </div>
    </div>
  );
}
