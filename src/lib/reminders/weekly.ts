// SERVER-ONLY (service role). The weekly reminder an accounting firm's
// clients get by email (2026-11-09 block in supabase/schema.sql), run by
// /api/cron/weekly-reminders.
//
// For every active firm link with weekly_reminder on, the client
// company's owners get one email listing:
//   * bank payments of this month and last month without a receipt
//     (src/lib/bank), booked at least PAYMENT_GRACE_DAYS ago so a card
//     payment from yesterday isn't chased before the receipt had a chance
//     to arrive;
//   * receipts that still miss their merchant, amount or date;
//   * how many receipts were read automatically and wait for a
//     confirmation (until confirmed they are not evidence anyone checked).
// Nothing is sent when all three are empty. Only to confirmed addresses,
// and never to a company whose owner turned the reminders off
// (firm_clients.reminders_opted_out_at).
//
// At most one email per company per ISO week: a client_reminders row is
// claimed (unique per organisation and week) before sending and removed
// again when no email could be sent, so a later run retries. The cron runs
// daily but sends only Monday to Wednesday (Stockholm): Monday normally,
// the next two days catch up what a timeout or a failure left over.
//
// Addresses come from the company's owner memberships, never from a
// request; Reply-To is the firm's first admin, so answers reach the
// accountant.

import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { homeCurrencyOf } from "@/lib/fx";
import { loadBankMonth } from "@/lib/bank/load";
import { dayLabel, receiptDay, type BankLineView } from "@/lib/bank/month";
import { adjacentMonths } from "@/lib/firm/client-stats";
import { firmVisible } from "@/lib/firm/visibility";
import { missingFieldsText, missingRequiredFields } from "@/lib/receipts/status";
import { formatAmount } from "@/lib/receipt-format";
import { sendEmail } from "@/lib/email/send";
import { weeklyReminderEmail } from "@/lib/email/templates";
import { absoluteAppUrl } from "@/lib/app-url";
import type { Receipt } from "@/lib/types";

export const PAYMENT_GRACE_DAYS = 2;
// Older receipts in review are the accountant's business, not a weekly nag.
export const RECEIPT_LOOKBACK_DAYS = 120;
// A cron function has 60 s; stop starting new companies after this.
export const RUN_BUDGET_MS = 45_000;
const SEND_GAP_MS = 250;

const DAY = 86_400_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Year, month, day and ISO weekday (1 = Monday) of `now` in Stockholm. */
export function stockholmDay(now: Date): { day: string; month: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  return { day, month: day.slice(0, 7), weekday };
}

/** ISO 8601 week of a YYYY-MM-DD day, e.g. "2026-W46". */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = d.getUTCDay() || 7;
  // The Thursday of this week decides the year.
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type ClientNeeds = {
  payments: BankLineView[];
  // Read automatically, complete, waiting only for a confirmation.
  toConfirm: number;
  receipts: Array<Pick<Receipt, "id" | "merchant_name" | "receipt_date" | "purchased_at" | "created_at"> & { missing: string }>;
};

/** What the firm is waiting for from one company. Throws when a read fails. */
export async function collectClientNeeds(organizationId: string, now: Date): Promise<ClientNeeds> {
  const { day, month } = stockholmDay(now);
  const home = await homeCurrencyOf(organizationId);
  const lastBooked = new Date(Date.parse(`${day}T00:00:00Z`) - PAYMENT_GRACE_DAYS * DAY).toISOString().slice(0, 10);

  const months = [adjacentMonths(month).prev, month];
  const views = await Promise.all(months.map((m) => loadBankMonth(organizationId, m, home)));
  if (views.some((v) => v === null)) throw new Error("bank lines unreadable");
  const payments = views
    .flatMap((v) => v!.lines)
    .filter((l) => l.state.kind === "missing" && l.bookedOn <= lastBooked)
    .sort((a, b) => a.bookedOn.localeCompare(b.bookedOn) || a.id.localeCompare(b.id));

  // Sent on the firm's behalf, so only what the firm may see: a mailbox
  // receipt waiting for the owner's confirmation is left out
  // (src/lib/firm/visibility.ts).
  const { data, error } = await firmVisible(
    getSupabaseAdmin()
      .from("receipts")
      .select("id, merchant_name, total, receipt_date, purchased_at, created_at, status")
      .eq("organization_id", organizationId)
  )
    .eq("status", "pending_review")
    .gte("created_at", new Date(now.getTime() - RECEIPT_LOOKBACK_DAYS * DAY).toISOString())
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`review receipts unreadable (${error.code})`);
  const pending = ((data ?? []) as Receipt[]).map((r) => ({ r, missing: missingRequiredFields(r) }));
  const toConfirm = pending.filter(({ missing }) => missing.length === 0).length;
  const receipts = pending
    .filter(({ missing }) => missing.length > 0)
    .map(({ r, missing }) => ({
      id: r.id,
      merchant_name: r.merchant_name,
      receipt_date: r.receipt_date,
      purchased_at: r.purchased_at,
      created_at: r.created_at,
      missing: missingFieldsText(missing),
    }));

  return { payments, receipts, toConfirm };
}

type LinkRow = {
  id: string;
  firm_id: string;
  organization_id: string;
  client_name: string;
  firms: { name: string } | { name: string }[] | null;
};

export type WeeklyRunResult = {
  ran: boolean;
  week: string;
  links: number;
  sent: number;
  nothingToAsk: number;
  alreadySent: number;
  failed: number;
  notReached: number;
};

export async function runWeeklyReminders(
  now = new Date(),
  opts: { budgetMs?: number; force?: boolean } = {}
): Promise<WeeklyRunResult> {
  const today = stockholmDay(now);
  const week = isoWeek(today.day);
  const result: WeeklyRunResult = { ran: false, week, links: 0, sent: 0, nothingToAsk: 0, alreadySent: 0, failed: 0, notReached: 0 };
  if (!opts.force && (today.weekday < 1 || today.weekday > 3)) return result;
  result.ran = true;

  const db = getSupabaseAdmin();
  const { data: linkData, error: linkError } = await db
    .from("firm_clients")
    .select("id, firm_id, organization_id, client_name, firms(name)")
    .eq("status", "active")
    .eq("weekly_reminder", true)
    // The client's own "no weekly reminders" always wins.
    .is("reminders_opted_out_at", null)
    .not("organization_id", "is", null)
    .not("firm_id", "is", null)
    // A stable order, so a run cut short by the budget and the catch-up
    // runs on the next days work through the same list.
    .order("id", { ascending: true });
  if (linkError) throw new Error(`links unreadable (${linkError.code})`);
  const links = (linkData ?? []) as unknown as LinkRow[];
  result.links = links.length;

  // Companies already emailed this week are skipped before their bank
  // lines and receipts are read (the claim below still guards a race).
  const { data: claimedData, error: claimedError } = await db
    .from("client_reminders")
    .select("organization_id")
    .eq("kind", "weekly")
    .eq("week", week);
  if (claimedError) throw new Error(`claims unreadable (${claimedError.code})`);
  const alreadyClaimed = new Set((claimedData ?? []).map((r) => r.organization_id as string));

  const replyTo = new Map<string, string | null>();
  const firmReplyTo = async (firmId: string): Promise<string | null> => {
    if (replyTo.has(firmId)) return replyTo.get(firmId)!;
    const { data } = await db
      .from("firm_members")
      .select("email")
      .eq("firm_id", firmId)
      .eq("role", "admin")
      .not("user_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const email = typeof data?.email === "string" ? data.email : null;
    replyTo.set(firmId, email);
    return email;
  };

  const deadline = Date.now() + (opts.budgetMs ?? RUN_BUDGET_MS);
  for (const [i, link] of links.entries()) {
    if (Date.now() >= deadline) {
      result.notReached = links.length - i;
      break;
    }
    if (alreadyClaimed.has(link.organization_id)) {
      result.alreadySent++;
      continue;
    }
    try {
      const needs = await collectClientNeeds(link.organization_id, now);
      if (needs.payments.length === 0 && needs.receipts.length === 0 && needs.toConfirm === 0) {
        result.nothingToAsk++;
        continue;
      }

      // The claim: one weekly email per company and week.
      const { data: claim, error: claimError } = await db
        .from("client_reminders")
        .insert({
          organization_id: link.organization_id,
          firm_id: link.firm_id,
          kind: "weekly",
          week,
          missing_count: needs.payments.length,
          review_count: needs.receipts.length + needs.toConfirm,
        })
        .select("id")
        .single();
      if (claimError) {
        if (claimError.code === "23505") {
          result.alreadySent++;
          continue;
        }
        throw new Error(`claim failed (${claimError.code})`);
      }

      const { data: owners, error: ownersError } = await db
        .from("memberships")
        .select("user_id")
        .eq("organization_id", link.organization_id)
        .eq("role", "owner");
      if (ownersError) throw new Error(`owners unreadable (${ownersError.code})`);

      const firm = Array.isArray(link.firms) ? link.firms[0] : link.firms;
      const content = weeklyReminderEmail({
        firmName: firm?.name ?? "Your accounting firm",
        clientName: link.client_name,
        payments: needs.payments.map((l) => ({
          day: dayLabel(l.bookedOn),
          description: l.description,
          amount: formatAmount(-l.amount, l.currency),
        })),
        receipts: needs.receipts.map((r) => {
          const d = receiptDay(r);
          return {
            day: d ? dayLabel(d) : dayLabel(r.created_at.slice(0, 10)),
            merchant: r.merchant_name?.trim() || "Receipt",
            missing: r.missing,
          };
        }),
        toConfirm: needs.toConfirm,
        appUrl: absoluteAppUrl("/app"),
        settingsUrl: absoluteAppUrl("/app/settings"),
      });
      const reply = await firmReplyTo(link.firm_id);

      let recipients = 0;
      for (const userId of [...new Set((owners ?? []).map((o) => o.user_id as string))]) {
        const { data: userRes } = await db.auth.admin.getUserById(userId);
        // Confirmed addresses only: the email carries bank text.
        const to = userRes?.user?.email_confirmed_at ? userRes.user.email : null;
        if (!to) continue;
        const sent = await sendEmail({ to, ...content, replyTo: reply, tag: "weekly_reminder" });
        if (sent.ok) recipients++;
        else console.error("[weekly-reminders] not sent", sent.reason);
        await sleep(SEND_GAP_MS);
      }

      if (recipients === 0) {
        // Let a later run try again this week.
        await db.from("client_reminders").delete().eq("id", claim.id);
        result.failed++;
        continue;
      }
      await db.from("client_reminders").update({ recipients }).eq("id", claim.id);
      const ids = needs.payments.map((l) => l.id);
      const stamp = new Date().toISOString();
      for (let j = 0; j < ids.length; j += 100) {
        await db
          .from("bank_transactions")
          .update({ reminded_at: stamp })
          .eq("organization_id", link.organization_id)
          .in("id", ids.slice(j, j + 100));
      }
      result.sent++;
    } catch (err) {
      result.failed++;
      console.error("[weekly-reminders] company failed", err instanceof Error ? err.message : "unknown");
    }
  }

  if (result.failed > 0 || result.notReached > 0) {
    Sentry.captureMessage("weekly reminders incomplete", {
      level: "warning",
      tags: { area: "weekly-reminders" },
      extra: { failed: result.failed, notReached: result.notReached },
    });
  }
  return result;
}
