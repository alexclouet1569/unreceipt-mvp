// SERVER-ONLY. Retention after cancellation (launch plan action 58), run
// daily by /api/cron/retention. It implements what the privacy page
// promises ("How long we keep it"): after a cancellation the account and
// receipts stay available for 90 days so they can be downloaded, we email
// before anything is deleted, then everything is permanently deleted.
//
// Safety rules, because deletion can't be undone:
// - Nothing runs while PILOT_MODE is on: the app lets everyone in for free
//   then, so a cancelled subscription doesn't mean the account is unused.
// - Only accounts whose every subscription has ended. Users without a
//   subscription row and anyone with a live subscription are never touched.
//   Each account is re-checked on its own right before acting (the bulk read
//   is only a shortlist), and deleteAccount() refuses if Stripe still has a
//   live subscription.
// - Receipts keep arriving (an auto-forward rule) → still in use: the clock
//   runs from the later of the cancellation and the last receipt.
// - Never delete without a reminder email about *this* cancellation (the
//   account_retention row records which ended_at it was about), and never
//   sooner than REMINDER_DAYS after that email, even if the job was down.
// - Admin accounts are skipped. At most MAX_DELETIONS_PER_RUN per run.
// The seven-year bookkeeping duty is the customer's; the reminder says so.

import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "./supabase-admin";
import { isAdminEmail } from "./auth-admin";
import { deleteAccount } from "./account-deletion";
import { isPilotMode } from "./pilot";
import { appUrl } from "./app-url";
import { founderReplyTo, sendEmail } from "./email/send";
import { retentionReminderEmail } from "./email/templates";

const DAY = 24 * 60 * 60 * 1000;
export const RETENTION_DAYS = 90;
export const REMINDER_DAYS = 14;
export const MAX_DELETIONS_PER_RUN = 20;

// Statuses where Stripe can still charge, or that may still become live.
const LIVE_STATUSES = new Set(["trialing", "active", "past_due", "incomplete", "unpaid"]);
const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

export type RetentionSubscription = {
  user_id: string;
  status: string;
  ended_at: string | null;
  current_period_end: string | null;
  updated_at: string | null;
};

export type RetentionRecord = { ended_at: string; reminder_sent_at: string };

/**
 * user id → when their last subscription ended, for users with no live
 * subscription. Rows written before ended_at existed fall back to the
 * period end, then to the last update.
 */
export function endedAccounts(rows: RetentionSubscription[]): Map<string, Date> {
  const byUser = new Map<string, RetentionSubscription[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }
  const out = new Map<string, Date>();
  for (const [userId, subs] of byUser) {
    if (subs.some((s) => LIVE_STATUSES.has(s.status))) continue;
    let latest: number | null = null;
    for (const s of subs) {
      if (!ENDED_STATUSES.has(s.status)) continue;
      const t = Date.parse(s.ended_at ?? s.current_period_end ?? s.updated_at ?? "");
      if (Number.isFinite(t) && (latest == null || t > latest)) latest = t;
    }
    if (latest != null) out.set(userId, new Date(latest));
  }
  return out;
}

/** When the account may be deleted, given when the reminder went out. */
export function deletionDate(endedAt: Date, reminderSentAt: Date): Date {
  return new Date(
    Math.max(endedAt.getTime() + RETENTION_DAYS * DAY, reminderSentAt.getTime() + REMINDER_DAYS * DAY),
  );
}

export type RetentionAction = "none" | "remind" | "wait" | "delete";

export function retentionAction(
  endedAt: Date,
  record: RetentionRecord | null,
  now: Date,
): RetentionAction {
  const remindFrom = endedAt.getTime() + (RETENTION_DAYS - REMINDER_DAYS) * DAY;
  if (now.getTime() < remindFrom) return "none";
  const reminded =
    record != null && Date.parse(record.ended_at) === endedAt.getTime();
  if (!reminded) return "remind";
  return now >= deletionDate(endedAt, new Date(record.reminder_sent_at)) ? "delete" : "wait";
}

function stockholmDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Stockholm",
  });
}

const PAGE = 1000;

async function loadAllSubscriptions(): Promise<RetentionSubscription[]> {
  const db = getSupabaseAdmin();
  const rows: RetentionSubscription[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("subscriptions")
      .select("user_id, status, ended_at, current_period_end, updated_at")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`subscriptions read failed (${error.code})`);
    rows.push(...((data ?? []) as RetentionSubscription[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/**
 * This user's retention clock start, read fresh: when their last
 * subscription ended or their last receipt arrived, whichever is later.
 * Null when they have a live subscription (or none at all).
 */
export async function currentClockStart(
  userId: string,
): Promise<{ clock: Date; subscriptionEnded: Date } | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("subscriptions")
    .select("user_id, status, ended_at, current_period_end, updated_at")
    .eq("user_id", userId);
  if (error) throw new Error(`subscriptions read failed (${error.code})`);
  const ended = endedAccounts((data ?? []) as RetentionSubscription[]).get(userId);
  if (!ended) return null;

  const { data: last, error: usageError } = await db
    .from("receipt_usage")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (usageError) throw new Error(`usage read failed (${usageError.code})`);
  const lastReceipt = last?.created_at ? Date.parse(last.created_at as string) : NaN;
  const clock =
    Number.isFinite(lastReceipt) && lastReceipt > ended.getTime() ? new Date(lastReceipt) : ended;
  return { clock, subscriptionEnded: ended };
}

export type RetentionRunResult = {
  reminded: number;
  deleted: number;
  waiting: number;
  skipped: number;
  failed: number;
};

export async function runRetention(now: Date = new Date()): Promise<RetentionRunResult> {
  const db = getSupabaseAdmin();
  const result: RetentionRunResult = { reminded: 0, deleted: 0, waiting: 0, skipped: 0, failed: 0 };

  if (isPilotMode()) return result;

  // Shortlist only: every candidate is re-checked on its own below.
  const ended = endedAccounts(await loadAllSubscriptions());
  if (ended.size === 0) return result;

  const recordByUser = new Map<string, RetentionRecord>();
  const ids = [...ended.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: records, error: recError } = await db
      .from("account_retention")
      .select("user_id, ended_at, reminder_sent_at")
      .in("user_id", ids.slice(i, i + 200));
    if (recError) throw new Error(`account_retention read failed (${recError.code})`);
    for (const r of records ?? []) recordByUser.set(r.user_id as string, r as RetentionRecord);
  }

  for (const [userId, shortlistEndedAt] of ended) {
    const record = recordByUser.get(userId) ?? null;
    // Cheap pre-filter on the shortlist date; the real decision uses the
    // fresh per-user clock (which can only be later).
    if (retentionAction(shortlistEndedAt, record, now) === "none") continue;
    let action: RetentionAction = "none";
    try {
      const fresh = await currentClockStart(userId);
      if (!fresh) {
        result.skipped++;
        continue;
      }
      const endedAt = fresh.clock;
      action = retentionAction(endedAt, record, now);
      if (action === "none") continue;
      if (action === "wait") {
        result.waiting++;
        continue;
      }
      if (action === "delete" && result.deleted >= MAX_DELETIONS_PER_RUN) {
        result.waiting++;
        continue;
      }

      const { data: userData, error: userError } = await db.auth.admin.getUserById(userId);
      if (userError || !userData?.user) {
        result.skipped++;
        continue;
      }
      const email = userData.user.email ?? null;
      if (!email || isAdminEmail(email)) {
        result.skipped++;
        continue;
      }

      if (action === "remind") {
        const deleteOn = deletionDate(endedAt, now);
        const content = retentionReminderEmail({
          // The sentence is about the subscription, not the clock (which
          // moves later when receipts keep arriving).
          endedOn: stockholmDate(fresh.subscriptionEnded),
          deleteOn: stockholmDate(deleteOn),
          settingsUrl: appUrl("/app/settings"),
          subscribeUrl: appUrl("/subscribe"),
          canReply: founderReplyTo() != null,
        });
        const sent = await sendEmail({
          to: email,
          ...content,
          replyTo: founderReplyTo(),
          tag: "retention_reminder",
        });
        // No email, no deletion: try again tomorrow.
        if (!sent.ok) {
          result.failed++;
          continue;
        }
        const { error: upsertError } = await db.from("account_retention").upsert(
          {
            user_id: userId,
            ended_at: endedAt.toISOString(),
            reminder_sent_at: now.toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (upsertError) throw new Error(`account_retention write failed (${upsertError.code})`);
        result.reminded++;
      } else {
        await deleteAccount(userId, { email, refuseIfLive: true });
        result.deleted++;
      }
    } catch (err) {
      result.failed++;
      console.error("[retention] failed", { action, err: err instanceof Error ? err.message : "unknown" });
      Sentry.captureException(err, { tags: { area: "retention", action } });
    }
  }

  return result;
}
