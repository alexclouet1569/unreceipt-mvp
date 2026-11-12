// SERVER-ONLY. Everything the customer's home screen needs, in one place, so
// the website (/app, src/app/app/(authed)/page.tsx) and the native iPhone app
// (GET /api/mobile/home) can never disagree about who sees what.
//
// Order matters and is the same for both: reads first (in parallel), then
// the decisions (firm-only staff, subscription gate), and only then the
// writes that mint an alias or a default organisation, so an accountant
// never gets a phantom company.

import * as Sentry from "@sentry/nextjs";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkSubscriptionGate } from "@/lib/subscription-gate";
import { buildForwardingAddress, getOrCreateAliasForUser } from "@/lib/email-alias";
import { getConciergeEmail } from "@/lib/concierge-email";
import { getOrCreateDefaultOrganization, hasAnyMembership } from "@/lib/organizations";
import { getFirmMembership } from "@/lib/require-firm";
import { loadAccountantLinks } from "@/lib/firm/client-links";
import { ensureHomeAmounts, homeCurrencyOf } from "@/lib/fx";
import { olderSummary } from "@/lib/analytics/aggregate";
import { loadSummaryRows } from "@/lib/analytics/load";
import type { OlderSummary } from "@/lib/mobile/types";
import type { Receipt } from "@/lib/types";

export const RECENT_RECEIPTS_LIMIT = 50;

export type PendingInvite = { id: string; firmName: string };

export type HomeData = {
  receipts: Receipt[];
  forwardingEmail: string;
  showOnboarding: boolean;
  accountantInvites: PendingInvite[];
  homeCurrency: string;
  /**
   * Counts and totals of every receipt not in `receipts`, so the screens'
   * numbers are right past the newest 50 (they add their own list to it).
   * Null when it couldn't be read: the screens then count their list only.
   */
  older: OlderSummary | null;
};

export type HomeLoad =
  // Firm staff with no company of their own: their place is /firm.
  | { kind: "firm_only" }
  // No active plan (and not pilot mode).
  | { kind: "subscribe" }
  // Back from Stripe Checkout before the webhook landed (website only).
  | { kind: "self_heal"; sessionId: string }
  | {
      kind: "ready";
      // "pilot": free pilot mode; "db_warning": the gate couldn't read the
      // subscription and let the user in anyway.
      access: "active" | "pilot" | "db_warning";
      data: HomeData;
    };

async function loadReceiptsForUser(userId: string): Promise<Receipt[]> {
  // Use the service-role client so the customer's first paint doesn't
  // wait on an extra cookie round-trip just to satisfy RLS we already
  // know is satisfied (the caller proved this is the right user).
  // Sort matches the receipts_user_id_purchased_at_idx index:
  // purchased_at DESC with NULLs last, falling back to created_at DESC.
  // Rows created before step 3 have NULL purchased_at and slot into the
  // bottom of the list by their creation time, which is the right UX.
  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .select("*")
    .eq("user_id", userId)
    .order("purchased_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    // A tiebreaker, so "Load more" continues exactly where the list ends.
    .order("id", { ascending: false })
    .limit(RECENT_RECEIPTS_LIMIT);

  if (error) {
    Sentry.captureException(error, { tags: { area: "home load" } });
    console.error("[home] receipts load failed", error);
    return [];
  }
  return (data ?? []) as Receipt[];
}

/** At most this many older receipts per "Load more". */
export const OLDER_PAGE_SIZE = 50;

/** A position in the home list: purchased_at (null sorts last), created_at, id. */
export type ListCursor = { purchasedAt: string | null; createdAt: string; id: string };

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A list key from the app (src/lib/mobile/receipt.ts listKeyOf), checked
 * strictly: its parts go into a PostgREST filter. Null when malformed.
 */
export function parseListCursor(key: string | null): ListCursor | null {
  if (!key || key.length > 120) return null;
  const parts = key.split("|");
  if (parts.length !== 3) return null;
  const [p, c, id] = parts;
  const isTime = (v: string) => TIMESTAMP.test(v) && !Number.isNaN(Date.parse(v));
  if ((p !== "" && !isTime(p)) || !isTime(c) || !UUID.test(id)) return null;
  return { purchasedAt: p === "" ? null : p, createdAt: c, id };
}

/**
 * The PostgREST or() filter for rows after `cur` in the home list's order
 * (purchased_at DESC NULLS LAST, created_at DESC, id DESC). Values are
 * quoted; parseListCursor() already allowed only timestamps and a uuid.
 */
export function afterCursorFilter(cur: ListCursor): string {
  const q = (v: string) => `"${v}"`;
  const tail = `created_at.lt.${q(cur.createdAt)},and(created_at.eq.${q(cur.createdAt)},id.lt.${q(cur.id)})`;
  if (cur.purchasedAt == null) return `and(purchased_at.is.null,or(${tail}))`;
  const p = q(cur.purchasedAt);
  return (
    `purchased_at.lt.${p},` +
    `and(purchased_at.eq.${p},or(${tail})),` +
    // Rows without a purchase time come after every dated one.
    `purchased_at.is.null`
  );
}

/**
 * The receipts after `cursor` in the home list's order, for "Load more" in
 * the iPhone app. Keyset, not offset: a receipt added or deleted meanwhile
 * never makes a page skip or repeat one. Scoped by user_id like the list.
 */
export async function loadOlderReceipts(
  userId: string,
  cursor: ListCursor,
): Promise<{ receipts: Receipt[]; hasMore: boolean }> {
  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .select("*")
    .eq("user_id", userId)
    .or(afterCursorFilter(cursor))
    .order("purchased_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    // One more than a page, to know whether another follows.
    .limit(OLDER_PAGE_SIZE + 1);
  if (error) throw new Error(`older receipts ${error.code}`);
  const rows = (data ?? []) as Receipt[];
  return { receipts: rows.slice(0, OLDER_PAGE_SIZE), hasMore: rows.length > OLDER_PAGE_SIZE };
}

// Accounting-firm invites addressed to this user that wait for an answer.
// Best-effort: a failed lookup just hides the notice (Settings still has it).
async function loadPendingInvites(user: User): Promise<PendingInvite[]> {
  try {
    const links = await loadAccountantLinks(user);
    return links
      .filter((l) => l.status === "invited")
      .map((l) => ({ id: l.id, firmName: l.firmName }));
  } catch (err) {
    console.error("[home] accountant invites load failed", err);
    return [];
  }
}

// One read of the profile for two things: whether first-run onboarding is
// done, and the forwarding alias if it was already minted. A failed read (or
// the column not existing yet) counts as onboarded (never trap someone in
// it) and as "no alias yet", which the mint step reads again.
async function loadProfileBits(userId: string): Promise<{ onboarded: boolean; aliasHash: string | null }> {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("onboarded_at, email_alias_hash")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { onboarded: true, aliasHash: null };
  const hash = data?.email_alias_hash;
  return {
    onboarded: Boolean(data?.onboarded_at),
    aliasHash: typeof hash === "string" && hash.length > 0 ? hash : null,
  };
}

// The user's default company with its currency, read only (no mint): almost
// every load finds it, which saves the separate currency read.
async function readDefaultOrganization(userId: string): Promise<{ id: string; currency: string } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("id, currency")
    .eq("default_for_user_id", userId)
    .maybeSingle();
  if (error || typeof data?.id !== "string") return null;
  const c = data.currency;
  return { id: data.id, currency: typeof c === "string" && /^[A-Z]{3}$/.test(c) ? c : "SEK" };
}

/**
 * The signed-in user's home screen. `sessionId` is Stripe Checkout's
 * ?session_id on the website's return; the app passes null.
 */
export async function loadHome(user: User, sessionId: string | null): Promise<HomeLoad> {
  // Everything the screen reads, at once rather than one query after the
  // other. All reads: nothing is created until the checks below pass. The
  // profile (alias) and company (currency) are read here too, so a normal
  // load needs only one more round: converting amounts and summing older
  // receipts, side by side.
  const [firmMembership, gate, loadedReceipts, profile, accountantInvites, existingOrg] =
    await Promise.all([
      getFirmMembership(user.id),
      checkSubscriptionGate(user.id, sessionId),
      loadReceiptsForUser(user.id),
      loadProfileBits(user.id),
      loadPendingInvites(user),
      readDefaultOrganization(user.id),
    ]);

  // Checked before the gate's answer and before any lazy mint below.
  if (firmMembership && !(await hasAnyMembership(user.id))) return { kind: "firm_only" };
  if (gate.kind === "redirect_subscribe") return { kind: "subscribe" };
  if (gate.kind === "self_heal") return { kind: "self_heal", sessionId: gate.sessionId };

  const listed = new Set(loadedReceipts.map((r) => r.id));
  // Only when the list may be cut: below the limit it holds everything.
  // Started now: it needs no currency until it is summed.
  const summaryRows =
    loadedReceipts.length < RECENT_RECEIPTS_LIMIT
      ? Promise.resolve([])
      : loadSummaryRows(user.id, listed).catch((err) => {
          Sentry.captureException(err, { tags: { area: "home summary" } });
          console.error("[home] summary load failed", err);
          return null;
        });

  // The forwarding alias (the live MX address that routes to
  // /api/intake/email) and the company this account's receipts belong to
  // (firm portal), minted only the first time. A missing profile falls back
  // to the legacy concierge address; a failed company mint to the insert
  // trigger, and SEK.
  const [aliasHash, homeCurrency] = await Promise.all([
    profile.aliasHash ?? getOrCreateAliasForUser(user.id),
    existingOrg
      ? existingOrg.currency
      : getOrCreateDefaultOrganization(user.id).then((id) => homeCurrencyOf(id)),
  ]);

  // Amounts in the company's currency next to foreign ones (src/lib/fx.ts).
  // Best effort: a missing rate leaves the receipt unconverted.
  const [receipts, rows] = await Promise.all([
    ensureHomeAmounts(loadedReceipts, homeCurrency).catch((err) => {
      console.error("[home] currency conversion failed", err);
      return loadedReceipts;
    }),
    summaryRows,
  ]);
  const older = rows ? olderSummary(rows, listed, homeCurrency) : null;
  const onboarded = profile.onboarded;

  return {
    kind: "ready",
    access:
      gate.kind === "allow"
        ? "active"
        : gate.reason === "pilot_mode"
          ? "pilot"
          : "db_warning",
    data: {
      receipts,
      forwardingEmail: aliasHash ? buildForwardingAddress(aliasHash) : getConciergeEmail(user.id),
      showOnboarding: !onboarded && loadedReceipts.length === 0,
      accountantInvites,
      homeCurrency,
      older,
    },
  };
}
