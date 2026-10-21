import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
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
import { ExportPanel } from "@/components/ExportPanel";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { getI18n } from "@/lib/i18n/server";

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

// Earliest purchase date, so the export can reach every month back to it.
async function loadFirstReceiptDate(userId: string): Promise<string | null> {
  // Older rows may only have receipt_date; take the earlier of both columns.
  const earliest = (column: "purchased_at" | "receipt_date") =>
    getSupabaseAdmin()
      .from("receipts")
      .select(column)
      .eq("user_id", userId)
      .not(column, "is", null)
      .order(column, { ascending: true })
      .limit(1)
      .maybeSingle();
  const [a, b] = await Promise.all([earliest("purchased_at"), earliest("receipt_date")]);
  const dates = [
    (a.data as { purchased_at?: string } | null)?.purchased_at,
    (b.data as { receipt_date?: string } | null)?.receipt_date,
  ].filter((d): d is string => typeof d === "string" && !Number.isNaN(Date.parse(d)));
  if (dates.length === 0) return null;
  return dates.reduce((min, d) => (Date.parse(d) < Date.parse(min) ? d : min));
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

  const [{ t: messages }, profile, aliasHash, usage, firstReceiptDate] = await Promise.all([
    getI18n(),
    loadProfile(user.id),
    getOrCreateAliasForUser(user.id),
    loadUsage(user.id),
    loadFirstReceiptDate(user.id),
  ]);
  const forwardingEmail = aliasHash ? buildForwardingAddress(aliasHash) : null;
  const intakeSmsNumber = process.env.NEXT_PUBLIC_INTAKE_SMS_NUMBER || null;
  const t = messages.settings.page;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link
            href="/app"
            aria-label={messages.common.backToReceipts}
            className="inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors"
            style={{ width: "44px", height: "44px", borderRadius: "10px" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "18px", letterSpacing: "-0.01em" }}
          >
            {messages.common.settings}
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <section aria-labelledby="intake-heading">
          <SectionLabel id="intake-heading">{t.sendReceipts}</SectionLabel>
          <div className="space-y-3">
            {forwardingEmail ? (
              <IntakeRow
                callout={t.forwardTo}
                value={forwardingEmail}
                mono
                copyLabel={t.copyForwarding}
              />
            ) : (
              <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
                {t.notReady}
              </p>
            )}
            {intakeSmsNumber ? (
              <IntakeRow
                callout={t.textPhoto}
                value={intakeSmsNumber}
                mono
                copyLabel={t.copySms}
              />
            ) : null}
            <Link
              href="/app/settings/forwarding"
              className="flex items-center justify-between gap-3 bg-card hover:bg-[var(--surface)] transition-colors"
              style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
            >
              <span>
                <span className="block text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
                  {t.howItWorks}
                </span>
                <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
                  {t.howItWorksBody}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {usage ? (
          <section aria-labelledby="usage-heading">
            <SectionLabel id="usage-heading">{t.usage}</SectionLabel>
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

        <section aria-labelledby="export-heading">
          <SectionLabel id="export-heading">{t.export}</SectionLabel>
          <div
            className="bg-card space-y-3"
            style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
          >
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
              {t.exportBody}
            </p>
            <ExportPanel firstReceiptDate={firstReceiptDate} />
          </div>
        </section>

        <section aria-labelledby="language-heading">
          <SectionLabel id="language-heading">{messages.common.language}</SectionLabel>
          <LanguageSwitch />
        </section>

        <section aria-labelledby="account-heading">
          <SectionLabel id="account-heading">{t.account}</SectionLabel>
          <dl
            className="bg-card divide-y divide-[var(--hairline)]"
            style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
          >
            <Row label={t.email} value={user.email ?? "—"} />
            <Row label={t.name} value={profile?.full_name || "—"} />
            <Row label={t.company} value={profile?.company_name || "—"} />
          </dl>
        </section>

        <section>
          <SignOutButton />
        </section>

        <section aria-labelledby="danger-heading">
          <SectionLabel id="danger-heading">{t.deleteAccount}</SectionLabel>
          <DeleteAccountSection exportSlot={<ExportPanel fixedPeriod="all" />} />
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
