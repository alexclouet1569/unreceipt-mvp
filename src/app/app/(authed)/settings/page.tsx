import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
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
import { AccountantSection } from "./AccountantSection";
import { CurrencySetting } from "./CurrencySetting";
import { ManageBillingButton } from "./ManageBillingButton";
import { loadBillingAccount } from "@/lib/stripe-billing";
import { homeCurrencyOf } from "@/lib/fx";
import { getDefaultOrganizationId } from "@/lib/organizations";
import { loadAccountantLinks } from "@/lib/firm/client-links";
import { firmExitNotice, planFirmExit } from "@/lib/firm/account-exit";
import { getNativeApp } from "@/lib/native-app-server";
import { loadFirstReceiptDate } from "@/lib/receipts/first-date";
import { findFirmForUser } from "@/lib/require-firm";
import { ForwardingUnavailable } from "../_forwarding-unavailable";
import { MailboxesSection } from "./mailboxes/MailboxesSection";
import { MailboxResultBanner } from "./mailboxes/MailboxResultBanner";
import { loadMailboxes } from "./mailboxes/load";
import { NO_PROVIDERS, anyProvider, parseMailboxResult } from "./mailboxes/copy";

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

// An accountant who also has a company deletes here; say what that does to
// their firm. Best-effort: deleteAccount() re-reads it and stops on an error.
async function loadFirmNotice(userId: string): Promise<string | null> {
  try {
    return firmExitNotice(await planFirmExit(getSupabaseAdmin(), userId));
  } catch (err) {
    console.error("[/app/settings] firm exit lookup failed", err);
    return null;
  }
}

// The Stripe customer behind "Manage billing". Best-effort: on an error
// the section is left out rather than breaking Settings.
async function loadBillingCustomer(userId: string): Promise<string | null> {
  try {
    return (await loadBillingAccount(userId)).customerId;
  } catch (err) {
    console.error("[/app/settings] billing lookup failed", err);
    Sentry.captureException(err, { tags: { area: "settings-billing" } });
    return null;
  }
}

async function loadUsage(userId: string): Promise<Usage | null> {
  try {
    return await getUsage(userId);
  } catch (err) {
    console.error("[/app/settings] usage load failed", err);
    return null;
  }
}

type SettingsPageProps = {
  // ?mailbox=connected|error|cancelled&reason=<code>: where a Gmail /
  // Outlook connect flow ends (resultUrl() in src/lib/mailboxes/oauth.ts).
  searchParams: Promise<{ mailbox?: string | string[]; reason?: string | string[] }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await getServerUser();
  if (!user) redirect("/app/login");
  const { mailbox, reason } = await searchParams;
  const mailboxResult = parseMailboxResult(mailbox, reason);

  const [
    profile,
    aliasHash,
    usage,
    firstReceiptDate,
    accountantLinks,
    homeCurrency,
    firmNotice,
    nativeApp,
    firm,
    billingCustomer,
    mailboxes,
  ] = await Promise.all([
    loadProfile(user.id),
    getOrCreateAliasForUser(user.id),
    loadUsage(user.id),
    loadFirstReceiptDate(user.id),
    loadAccountantLinks(user),
    getDefaultOrganizationId(user.id).then(homeCurrencyOf),
    loadFirmNotice(user.id),
    getNativeApp(),
    findFirmForUser(user).catch((err) => {
      console.error("[/app/settings] firm lookup failed", err);
      Sentry.captureException(err, { tags: { area: "settings-firm-link" } });
      return null;
    }),
    loadBillingCustomer(user.id),
    loadMailboxes(user.id),
  ]);
  const forwardingEmail = aliasHash ? buildForwardingAddress(aliasHash) : null;
  const intakeSmsNumber = process.env.NEXT_PUBLIC_INTAKE_SMS_NUMBER || null;
  // The Capacitor shell can't finish an OAuth flow (Google's screen opens
  // in Safari, away from the cookie that binds the flow to this browser):
  // no connect buttons there. Mailboxes already connected still show.
  const mailboxProviders = nativeApp ? NO_PROVIDERS : mailboxes.providers;
  const showMailboxes =
    anyProvider(mailboxProviders) || mailboxes.connections.length > 0 || mailboxes.failed;

  return (
    // The header and tabs come from the (authed) layout (AppNav).
    <div>
      <div className="mx-auto max-w-[540px] space-y-8 px-4 py-6 max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+88px)]">
        <h1 className="type-display-lg text-[var(--ink)]">Settings</h1>
        {mailboxResult ? <MailboxResultBanner result={mailboxResult} /> : null}
        {firm ? (
          <section aria-labelledby="firm-portal-heading">
            <SectionLabel id="firm-portal-heading">Firm portal</SectionLabel>
            {/* The way from the company side to /firm for people in both: in
                the store app there's no address bar to type it. */}
            <Link
              href="/firm"
              className="flex items-center justify-between gap-3 bg-card hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
              style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
            >
              <span className="min-w-0">
                <span
                  className="block text-[var(--ink)] [overflow-wrap:anywhere]"
                  style={{ fontSize: "15px", fontWeight: 600 }}
                >
                  {firm.pending ? `Join ${firm.firmName}` : `Open ${firm.firmName}`}
                </span>
                <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
                  {firm.pending
                    ? "This firm added your email to its portal. Join only if you work there."
                    : "Your clients\u2019 receipts, bookkeeping exports and colleagues."}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
            </Link>
          </section>
        ) : null}

        {/* Without a provider set up (preview, dev) and nothing connected,
            "Send us receipts" below is the whole story: no section here. */}
        {showMailboxes ? (
          <section aria-labelledby="mailboxes-heading">
            <SectionLabel id="mailboxes-heading">Your email</SectionLabel>
            <MailboxesSection
              providers={mailboxProviders}
              connections={mailboxes.connections}
              limit={mailboxes.limit}
              failed={mailboxes.failed}
            />
          </section>
        ) : null}

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
              <ForwardingUnavailable />
            )}
            {intakeSmsNumber ? (
              <IntakeRow
                callout="Or text a photo to"
                value={intakeSmsNumber}
                mono
                copyLabel="Copy SMS number"
              />
            ) : null}
            <Link
              href="/app/settings/forwarding"
              className="flex items-center justify-between gap-3 bg-card hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
              style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
            >
              <span>
                <span className="block text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
                  How it works and automatic forwarding
                </span>
                <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
                  Every email sent to this address becomes a receipt. Set a
                  rule once in Gmail or Outlook and receipts arrive by themselves.
                </span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
            </Link>
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
              hidePrices={Boolean(nativeApp)}
            />
          </section>
        ) : null}

        {/* Website only: the store apps point to no purchase management
            (App Store 3.1.3(f)), and /api/billing/portal refuses them too. */}
        {billingCustomer && !nativeApp ? (
          <section aria-labelledby="billing-heading">
            <SectionLabel id="billing-heading">Billing</SectionLabel>
            <div
              className="bg-card space-y-3"
              style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
            >
              <p className="type-body text-[var(--ink-muted)]">
                Change your plan, update your card, download invoices or
                cancel. Opens Stripe, our payment provider.
              </p>
              <ManageBillingButton />
            </div>
          </section>
        ) : null}

        <section aria-labelledby="export-heading">
          <SectionLabel id="export-heading">Export for your accountant</SectionLabel>
          <div
            className="bg-card space-y-3"
            style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
          >
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
              One ZIP with a spreadsheet of the period&apos;s receipts, every
              receipt as a PDF and each original photo, PDF or email.
            </p>
            <ExportPanel firstReceiptDate={firstReceiptDate} />
          </div>
        </section>

        <section aria-labelledby="currency-heading">
          <SectionLabel id="currency-heading">Currency</SectionLabel>
          <CurrencySetting currency={homeCurrency} />
        </section>

        <section aria-labelledby="accountant-heading">
          <SectionLabel id="accountant-heading">Your accountant</SectionLabel>
          <AccountantSection links={accountantLinks} />
        </section>

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
            exportSlot={<ExportPanel fixedPeriod="all" />}
            firmNotice={firmNotice}
          />
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="uppercase text-[var(--ink-muted)]"
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
