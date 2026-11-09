// The founder's live view of the pilot (/admin/pilot): every accounting
// firm, its people, its clients and what is happening with their receipts,
// plus a feed of recent events. Counts and statuses only: no merchant
// names, amounts or bank text leave the client companies' rows here.
//
// buildPilotOverview() is pure (tested); loadPilotOverview() is the
// SERVER-ONLY service-role read behind it, called after requireAdmin().

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { missingRequiredFields } from "@/lib/receipts/status";

export const WINDOW_DAYS = 60;
export const FEED_LIMIT = 80;
const DAY = 86_400_000;

export type RawFirm = { id: string; name: string; created_at: string };
export type RawMember = { firm_id: string; email: string; role: string; user_id: string | null; claimed_at: string | null };
export type RawLink = {
  firm_id: string | null;
  organization_id: string | null;
  client_name: string;
  status: string;
  direction: string;
  weekly_reminder: boolean | null;
  accepted_at: string | null;
  created_at: string;
};
export type RawReceipt = {
  organization_id: string | null;
  status: string;
  source: string;
  created_at: string;
  merchant_name: string | null;
  total: number | null;
  receipt_date: string | null;
  purchased_at: string | null;
};
export type RawReminder = { organization_id: string; kind: string; missing_count: number; review_count: number; recipients: number; sent_at: string };
export type RawBankLine = { organization_id: string; imported_at: string };

export type ClientOverview = {
  organizationId: string;
  name: string;
  receipts: number;
  thisWeek: number;
  toComplete: number;
  toConfirm: number;
  lastReceiptAt: string | null;
  bySource: Record<string, number>;
  bankLines: number;
  weeklyReminder: boolean;
  lastReminderAt: string | null;
};

export type FirmOverview = {
  id: string;
  name: string;
  createdAt: string;
  members: Array<{ email: string; role: string; signedIn: boolean }>;
  clients: ClientOverview[];
  invited: Array<{ name: string; since: string; direction: string }>;
};

export type FeedEvent = { at: string; firm: string; client: string | null; text: string };

export type PilotOverview = {
  firms: FirmOverview[];
  feed: FeedEvent[];
  totals: { firms: number; clients: number; receiptsThisWeek: number; toComplete: number; remindersThisWeek: number };
};

const SOURCE_LABEL: Record<string, string> = {
  paper: "photo",
  email: "forwarded email",
  manual: "typed in",
  sms: "SMS",
};

export function buildPilotOverview(
  raw: {
    firms: RawFirm[];
    members: RawMember[];
    links: RawLink[];
    receipts: RawReceipt[];
    reminders: RawReminder[];
    bankLines: RawBankLine[];
  },
  now: Date
): PilotOverview {
  const weekAgo = now.getTime() - 7 * DAY;
  const firmName = new Map(raw.firms.map((f) => [f.id, f.name]));
  const active = raw.links.filter((l) => l.status === "active" && l.firm_id && l.organization_id);
  const orgClient = new Map(active.map((l) => [l.organization_id as string, l]));

  const clientStats = new Map<string, ClientOverview>();
  for (const l of active) {
    clientStats.set(l.organization_id as string, {
      organizationId: l.organization_id as string,
      name: l.client_name,
      receipts: 0,
      thisWeek: 0,
      toComplete: 0,
      toConfirm: 0,
      lastReceiptAt: null,
      bySource: {},
      bankLines: 0,
      weeklyReminder: l.weekly_reminder !== false,
      lastReminderAt: null,
    });
  }

  const feed: FeedEvent[] = [];
  const where = (orgId: string | null) => {
    const link = orgId ? orgClient.get(orgId) : undefined;
    return link ? { firm: firmName.get(link.firm_id as string) ?? "Firm", client: link.client_name } : null;
  };

  for (const r of raw.receipts) {
    const c = r.organization_id ? clientStats.get(r.organization_id) : undefined;
    if (!c) continue;
    c.receipts++;
    const created = Date.parse(r.created_at);
    if (created >= weekAgo) c.thisWeek++;
    if (!c.lastReceiptAt || r.created_at > c.lastReceiptAt) c.lastReceiptAt = r.created_at;
    const source = SOURCE_LABEL[r.source] ?? r.source;
    c.bySource[source] = (c.bySource[source] ?? 0) + 1;
    const missing = r.status === "pending_review" ? missingRequiredFields(r) : [];
    if (r.status === "pending_review") {
      if (missing.length > 0) c.toComplete++;
      else c.toConfirm++;
    }
    const w = where(r.organization_id);
    if (w) {
      feed.push({
        at: r.created_at,
        ...w,
        text: `New receipt (${source})${r.status === "pending_review" ? (missing.length > 0 ? ", missing a field" : ", to confirm") : ""}`,
      });
    }
  }

  // Bank imports: one event per import (lines share imported_at).
  const imports = new Map<string, number>();
  for (const b of raw.bankLines) {
    const c = clientStats.get(b.organization_id);
    if (c) c.bankLines++;
    const key = `${b.organization_id}|${b.imported_at}`;
    imports.set(key, (imports.get(key) ?? 0) + 1);
  }
  for (const [key, n] of imports) {
    const [orgId, at] = key.split("|");
    const w = where(orgId);
    if (w) feed.push({ at, ...w, text: `Bank statement imported (${n} payment${n === 1 ? "" : "s"} out)` });
  }

  let remindersThisWeek = 0;
  for (const r of raw.reminders) {
    const c = clientStats.get(r.organization_id);
    if (c && (!c.lastReminderAt || r.sent_at > c.lastReminderAt)) c.lastReminderAt = r.sent_at;
    if (Date.parse(r.sent_at) >= weekAgo) remindersThisWeek++;
    const w = where(r.organization_id);
    const parts = [
      r.missing_count > 0 ? `${r.missing_count} payment${r.missing_count === 1 ? "" : "s"} without receipt` : null,
      r.review_count > 0 ? `${r.review_count} to complete` : null,
    ].filter(Boolean);
    if (w) {
      feed.push({
        at: r.sent_at,
        ...w,
        text: `${r.kind === "weekly" ? "Weekly reminder" : "Reminder sent by the accountant"}${parts.length ? `: ${parts.join(", ")}` : ""}${r.recipients === 0 ? " (not delivered)" : ""}`,
      });
    }
  }

  for (const l of raw.links) {
    const firm = l.firm_id ? firmName.get(l.firm_id) : undefined;
    if (!firm) continue;
    if (l.status === "active" && l.accepted_at) feed.push({ at: l.accepted_at, firm, client: l.client_name, text: "Client connected" });
    if (l.status === "invited") feed.push({ at: l.created_at, firm, client: l.client_name, text: l.direction === "client" ? "Client invited the accountant" : "Client invited" });
  }
  for (const m of raw.members) {
    const firm = firmName.get(m.firm_id);
    if (firm && m.claimed_at) feed.push({ at: m.claimed_at, firm, client: null, text: `${m.email} signed in for the first time` });
  }

  const firms: FirmOverview[] = raw.firms
    .map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: f.created_at,
      members: raw.members
        .filter((m) => m.firm_id === f.id)
        .map((m) => ({ email: m.email, role: m.role, signedIn: m.user_id !== null })),
      clients: active
        .filter((l) => l.firm_id === f.id)
        .map((l) => clientStats.get(l.organization_id as string)!)
        .sort((a, b) => (b.lastReceiptAt ?? "").localeCompare(a.lastReceiptAt ?? "") || a.name.localeCompare(b.name)),
      invited: raw.links
        .filter((l) => l.firm_id === f.id && l.status === "invited")
        .map((l) => ({ name: l.client_name, since: l.created_at, direction: l.direction })),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const clients = [...clientStats.values()];
  return {
    firms,
    feed: feed.sort((a, b) => b.at.localeCompare(a.at)).slice(0, FEED_LIMIT),
    totals: {
      firms: firms.length,
      clients: clients.length,
      receiptsThisWeek: clients.reduce((n, c) => n + c.thisWeek, 0),
      toComplete: clients.reduce((n, c) => n + c.toComplete, 0),
      remindersThisWeek,
    },
  };
}

/** SERVER-ONLY. Call after requireAdmin(). */
export async function loadPilotOverview(now = new Date()): Promise<PilotOverview> {
  const db = getSupabaseAdmin();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY).toISOString();
  const [firms, members, links] = await Promise.all([
    db.from("firms").select("id, name, created_at").limit(500),
    db.from("firm_members").select("firm_id, email, role, user_id, claimed_at").limit(2000),
    db
      .from("firm_clients")
      .select("firm_id, organization_id, client_name, status, direction, weekly_reminder, accepted_at, created_at")
      .in("status", ["active", "invited"])
      .limit(5000),
  ]);
  for (const r of [firms, members, links]) if (r.error) throw new Error(`pilot read failed (${r.error.code})`);
  const orgIds = [
    ...new Set(
      ((links.data ?? []) as RawLink[])
        .filter((l) => l.status === "active" && l.organization_id)
        .map((l) => l.organization_id as string)
    ),
  ];

  let receipts: RawReceipt[] = [];
  let reminders: RawReminder[] = [];
  let bankLines: RawBankLine[] = [];
  if (orgIds.length > 0) {
    const [r, rem, bank] = await Promise.all([
      db
        .from("receipts")
        .select("organization_id, status, source, created_at, merchant_name, total, receipt_date, purchased_at")
        .in("organization_id", orgIds)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10_000),
      db
        .from("client_reminders")
        .select("organization_id, kind, missing_count, review_count, recipients, sent_at")
        .in("organization_id", orgIds)
        .gte("sent_at", since)
        .limit(5000),
      db
        .from("bank_transactions")
        .select("organization_id, imported_at")
        .in("organization_id", orgIds)
        .gte("imported_at", since)
        .limit(20_000),
    ]);
    for (const x of [r, rem, bank]) if (x.error) throw new Error(`pilot read failed (${x.error.code})`);
    receipts = (r.data ?? []) as RawReceipt[];
    reminders = (rem.data ?? []) as RawReminder[];
    bankLines = (bank.data ?? []) as RawBankLine[];
  }

  return buildPilotOverview(
    {
      firms: (firms.data ?? []) as RawFirm[],
      members: (members.data ?? []) as RawMember[],
      links: (links.data ?? []) as RawLink[],
      receipts,
      reminders,
      bankLines,
    },
    now
  );
}
