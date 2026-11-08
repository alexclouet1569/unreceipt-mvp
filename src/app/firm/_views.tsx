// Presentational views of the firm portal, shared by the real pages (which
// load the data and check access) and the public demo tour at /demo/accountant (which
// passes sample data). No data loading and no access checks here: callers
// own both. Every link target comes from `hrefs`, so the demo can keep
// navigation inside itself.

import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { EMPTY_STATS, adjacentMonths, monthLabel, type ClientStats } from "@/lib/firm/client-stats";
import { formatDate } from "@/lib/receipt-format";
import type { FirmClient, FirmMemberRole, Receipt } from "@/lib/types";
import { AddClientDialog } from "./clients/AddClientDialog";
import { RevokeInviteButton } from "./clients/RevokeInviteButton";
import { ExportMonthPanel } from "./clients/[orgId]/ExportMonthPanel";
import { BankPanel } from "./clients/[orgId]/BankPanel";
import type { BankMonthView } from "@/lib/bank/month";
import { FirmReceiptList } from "./clients/[orgId]/FirmReceiptList";
import { MembersSection, type MemberView } from "./settings/MembersSection";

export type ActiveClient = Pick<
  FirmClient,
  "id" | "client_name" | "client_org_number"
> & { organization_id: string };

export type PendingInvite = Pick<
  FirmClient,
  "id" | "client_name" | "invited_email" | "invite_expires_at" | "created_at"
> & { expired: boolean };

const iconLink =
  "inline-flex items-center justify-center rounded-[10px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-card transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Header + main column of the firm portal (desktop-first, 1040px). */
export function FirmShell({
  firmName,
  homeHref,
  nav,
  children,
}: {
  firmName: string;
  homeHref: string;
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-[1040px] mx-auto px-4 h-14 flex items-center gap-4">
          <Link href={homeHref} aria-label="UnReceipt for firms">
            <Wordmark />
          </Link>
          <span
            className="hidden sm:inline truncate text-[var(--ink-muted)]"
            style={{ fontSize: "14px" }}
          >
            {firmName}
          </span>
          {nav}
        </div>
      </header>

      <main className="max-w-[1040px] mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

function MonthSwitch({ month, hrefFor }: { month: string; hrefFor: (month: string) => string }) {
  const { prev, next } = adjacentMonths(month);
  return (
    <div className="flex items-center gap-1">
      <Link href={hrefFor(prev)} aria-label="Previous month" className={iconLink} style={{ width: "44px", height: "44px" }}>
        <ChevronLeft className="w-5 h-5" />
      </Link>
      <span className="font-display font-bold text-[var(--ink)] min-w-[9rem] text-center" style={{ fontSize: "15px" }}>
        {monthLabel(month)}
      </span>
      <Link href={hrefFor(next)} aria-label="Next month" className={iconLink} style={{ width: "44px", height: "44px" }}>
        <ChevronRight className="w-5 h-5" />
      </Link>
    </div>
  );
}

/** /firm/clients: connected clients with this month's counts, pending invites. */
export function ClientsView({
  active,
  pending,
  stats,
  month,
  hrefs,
}: {
  active: ActiveClient[];
  pending: PendingInvite[];
  stats: Map<string, ClientStats>;
  month: string;
  hrefs: { month: (month: string) => string; client: (organizationId: string, month: string) => string };
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "22px", letterSpacing: "-0.01em" }}
          >
            Clients
          </h1>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            {active.length === 0
              ? "No client connected yet."
              : `${active.length} connected client${active.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <MonthSwitch month={month} hrefFor={hrefs.month} />
      </div>

      <AddClientDialog />

      {active.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--brand-tint)] px-5 py-8 text-center">
          <p className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "16px" }}>
            Connect your first client
          </p>
          <p className="mt-1 text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            Invite a client company by email. Once they accept, their receipts
            appear here, month by month.
          </p>
        </div>
      ) : (
        <ClientTable active={active} stats={stats} month={month} clientHref={hrefs.client} />
      )}

      {pending.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "16px" }}>
            Waiting for the client
          </h2>
          <ul className="divide-y divide-[var(--hairline)] rounded-[12px] border border-[var(--hairline)] bg-card">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-medium text-[var(--ink)]" style={{ fontSize: "14px" }}>
                  {p.client_name}
                </span>
                <span className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                  {p.invited_email} · invited {formatDate(p.created_at)}
                  {p.expired ? " · link expired" : ""}
                </span>
                <span className="ml-auto">
                  <RevokeInviteButton id={p.id} clientName={p.client_name} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ClientTable({
  active,
  stats,
  month,
  clientHref,
}: {
  active: ActiveClient[];
  stats: Map<string, ClientStats>;
  month: string;
  clientHref: (organizationId: string, month: string) => string;
}) {
  const head = "px-4 py-2 text-left font-semibold text-[var(--ink-muted)]";
  const cell = "px-4 py-3";
  const num = "px-4 py-3 text-right tabular-nums";
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[var(--hairline)] bg-card">
      <table className="w-full" style={{ fontSize: "14px" }}>
        <thead className="border-b border-[var(--hairline)]" style={{ fontSize: "12px" }}>
          <tr>
            <th className={head}>Client</th>
            <th className={head + " text-right"}>New</th>
            <th className={head + " text-right"}>Review needed</th>
            <th className={head + " text-right"}>Ready</th>
            <th className={head + " text-right"}>Exported</th>
            <th className={head}>Last receipt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--hairline)]">
          {active.map((c) => {
            const s = stats.get(c.organization_id) ?? EMPTY_STATS;
            return (
              <tr key={c.id} className="hover:bg-card transition-colors">
                <td className={cell}>
                  <Link
                    href={clientHref(c.organization_id, month)}
                    className="inline-flex min-h-11 items-center font-medium text-[var(--ink)] hover:underline rounded-[6px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {c.client_name}
                  </Link>
                  {c.client_org_number ? (
                    <span className="ml-2 text-[var(--ink-muted)]" style={{ fontSize: "12px" }}>
                      {c.client_org_number}
                    </span>
                  ) : null}
                </td>
                <td className={num}>{s.newThisWeek}</td>
                <td className={num} style={s.reviewNeeded > 0 ? { color: "var(--attention-deep)" } : undefined}>
                  {s.reviewNeeded}
                </td>
                <td className={num}>{s.ready}</td>
                <td className={num}>{s.exported}</td>
                <td className={cell + " text-[var(--ink-muted)]"}>
                  {s.lastReceiptAt ? formatDate(s.lastReceiptAt) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** /firm/clients/[orgId]: one client's month, bank check, export panel and receipts. */
export function ClientView({
  clientName,
  organizationId,
  month,
  receipts,
  bank,
  hrefs,
}: {
  clientName: string;
  organizationId: string;
  month: string;
  receipts: Receipt[];
  // Null when the bank lines couldn't be loaded.
  bank: BankMonthView | null;
  hrefs: { back: string; month: (month: string) => string };
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href={hrefs.back} aria-label="Back to clients" className={iconLink} style={{ width: "44px", height: "44px" }}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1
              className="font-display font-bold text-[var(--ink)]"
              style={{ fontSize: "22px", letterSpacing: "-0.01em" }}
            >
              {clientName}
            </h1>
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
              {receipts.length === 0
                ? `No receipts in ${monthLabel(month)}.`
                : `${receipts.length} receipt${receipts.length === 1 ? "" : "s"} in ${monthLabel(month)}.`}
            </p>
          </div>
        </div>
        <MonthSwitch month={month} hrefFor={hrefs.month} />
      </div>

      <BankPanel organizationId={organizationId} clientName={clientName} month={month} bank={bank} />

      <ExportMonthPanel
        organizationId={organizationId}
        month={month}
        unexportedCount={receipts.filter((r) => r.status === "verified" && !r.exported_at).length}
        reviewCount={receipts.filter((r) => r.status === "pending_review").length}
      />

      <FirmReceiptList receipts={receipts} />
    </div>
  );
}

/** /firm/settings: the firm and its people. */
export function SettingsView({
  firmName,
  email,
  role,
  members,
  selfId,
  accountSlot,
}: {
  firmName: string;
  email: string | null;
  role: FirmMemberRole;
  members: MemberView[];
  selfId: string;
  // "Delete account", passed only by the real page: the /demo tour renders
  // this view too and must never reach a real route.
  accountSlot?: React.ReactNode;
}) {
  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1
          className="font-display font-bold text-[var(--ink)]"
          style={{ fontSize: "22px", letterSpacing: "-0.01em" }}
        >
          {firmName}
        </h1>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
          Signed in as {email ?? "you"} · {role === "admin" ? "admin" : "staff"}
        </p>
      </div>

      <section aria-labelledby="members-heading">
        <h2
          id="members-heading"
          className="uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "8px" }}
        >
          People in the firm
        </h2>
        <MembersSection members={members} isAdmin={role === "admin"} selfId={selfId} />
      </section>

      {accountSlot ? (
        <section aria-labelledby="account-heading">
          <h2
            id="account-heading"
            className="uppercase text-[var(--ink-faint)]"
            style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "8px" }}
          >
            Your account
          </h2>
          {accountSlot}
        </section>
      ) : null}
    </div>
  );
}
