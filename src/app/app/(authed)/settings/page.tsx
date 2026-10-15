import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  buildForwardingAddress,
  getOrCreateAliasForUser,
} from "@/lib/email-alias";
import { IntakeRow } from "@/components/IntakeRow";
import { UsageMeter } from "@/components/UsageMeter";
import { getUsage, type Usage } from "@/lib/usage";
import { planSuggestion } from "@/lib/usage-copy";
import { SignOutButton } from "./SignOutButton";
import { DeleteAccountSection } from "./DeleteAccountSection";

// Settings is reachable without an active subscription on purpose: a
// lapsed customer must still be able to see their account, sign out and
// (later) export or delete their data.
export const dynamic = "force-dynamic";

async function loadProfile(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("full_name, company_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[/app/settings] profile load failed", error);
    return null;
  }
  return data as { full_name: string | null; company_name: string | null } | null;
}

async function loadUsage(userId: string): Promise<Usage | null> {
  try {
    return await getUsage(userId);
  } catch (err) {
    console.error("[/app/settings] usage load failed", err);
    return null;
  }
}

export default async function SettingsPage() {
  const user = await getServerUser();
  if (!user) redirect("/app/login");

  const [profile, aliasHash, usage] = await Promise.all([
    loadProfile(user.id),
    getOrCreateAliasForUser(user.id),
    loadUsage(user.id),
  ]);
  const forwardingEmail = aliasHash ? buildForwardingAddress(aliasHash) : null;
  const intakeSmsNumber = process.env.NEXT_PUBLIC_INTAKE_SMS_NUMBER || null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link
            href="/app"
            aria-label="Back to receipts"
            className="inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors"
            style={{ width: "44px", height: "44px", borderRadius: "10px" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "18px", letterSpacing: "-0.01em" }}
          >
            Settings
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <section aria-labelledby="intake-heading">
          <SectionLabel id="intake-heading">Send us receipts</SectionLabel>
          <div className="space-y-3">
            {forwardingEmail ? (
              <IntakeRow
                callout="Forward email receipts to"
                value={forwardingEmail}
                mono
                copyLabel="Copy forwarding address"
              />
            ) : (
              <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
                Your forwarding address isn&apos;t ready yet. Reload this page
                in a moment.
              </p>
            )}
            {intakeSmsNumber ? (
              <IntakeRow
                callout="Or text a photo to"
                value={intakeSmsNumber}
                mono
                copyLabel="Copy SMS number"
              />
            ) : null}
            <p
              className="font-accent italic text-[var(--ink-muted)]"
              style={{ fontSize: "13px" }}
            >
              Tip: set up an automatic forwarding rule in your email so
              receipts arrive here without you lifting a finger.
            </p>
          </div>
        </section>

        {usage ? (
          <section aria-labelledby="usage-heading">
            <SectionLabel id="usage-heading">Receipts this period</SectionLabel>
            <UsageMeter
              used={usage.used}
              plan={usage.plan}
              extra={usage.extra}
              overageBilled={usage.overageBilled}
              periodEnd={usage.periodEnd.toISOString()}
              suggestion={planSuggestion(usage)}
            />
          </section>
        ) : null}

        <section aria-labelledby="account-heading">
          <SectionLabel id="account-heading">Account</SectionLabel>
          <dl
            className="bg-card divide-y divide-[var(--hairline)]"
            style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
          >
            <Row label="Email" value={user.email ?? "—"} />
            <Row label="Name" value={profile?.full_name || "—"} />
            <Row label="Company" value={profile?.company_name || "—"} />
          </dl>
        </section>

        <section>
          <SignOutButton />
        </section>

        <section aria-labelledby="danger-heading">
          <SectionLabel id="danger-heading">Delete account</SectionLabel>
          <DeleteAccountSection
            exportSlot={
              <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
                Open each receipt and tap Download PDF.
              </p>
            }
          />
        </section>
      </main>
    </div>
  );
}

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="uppercase text-[var(--ink-faint)]"
      style={{
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        marginBottom: "8px",
      }}
    >
      {children}
    </h2>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4" style={{ padding: "12px 14px" }}>
      <dt className="text-[var(--ink-muted)]" style={{ fontSize: "13px", fontWeight: 500 }}>
        {label}
      </dt>
      <dd
        className="text-[var(--ink)] truncate text-right"
        style={{ fontSize: "15px", fontWeight: 500 }}
      >
        {value}
      </dd>
    </div>
  );
}
