// SERVER-ONLY. Everything the customer's home screen needs, in one place, so
// the website (/app, src/app/app/(authed)/page.tsx) and the native iPhone app
// (GET /api/mobile/home) can never disagree about who sees what.
//
// Order matters and is the same for both: reads first (in parallel), then
// the decisions (firm-only staff, subscription gate), and only then the
// writes that mint an alias or a default organisation, so an accountant
// never gets a phantom company.

import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { chosenCountry, guessCountry } from "@/lib/country";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkSubscriptionGate } from "@/lib/subscription-gate";
import { buildForwardingAddress, getOrCreateAliasForUser } from "@/lib/email-alias";
import { getOrCreateDefaultOrganization, hasAnyMembership } from "@/lib/organizations";
import { findPendingFirmSeat, getFirmMembership } from "@/lib/require-firm";
import { normalizedSessionEmail } from "@/lib/email-address";
import { isInviteExpired } from "@/lib/firm/invites";
import { loadAccountantLinks } from "@/lib/firm/client-links";
import { ensureHomeAmounts, homeCurrencyOf } from "@/lib/fx";
import { olderSummary } from "@/lib/analytics/aggregate";
import { loadSummaryRows } from "@/lib/analytics/load";
import type { MobileTeam, OlderSummary } from "@/lib/mobile/types";
import { getEmployment } from "@/lib/team/membership";
import { loadHomeTeam } from "@/lib/team/decisions";
import type { Receipt } from "@/lib/types";

export const RECENT_RECEIPTS_LIMIT = 50;

export type PendingInvite = { id: string; firmName: string };

export type HomeData = {
  receipts: Receipt[];
  /**
   * The user's forwarding address, or null when it couldn't be minted on
   * this load (a database error): never a made-up address that doesn't
   * route. The screens show "not available yet, reload" for null.
   */
  forwardingEmail: string | null;
  showOnboarding: boolean;
  accountantInvites: PendingInvite[];
  homeCurrency: string;
  /**
   * Counts and totals of every receipt not in `receipts`, so the screens'
   * numbers are right past the newest 50 (they add their own list to it).
   * Null when it couldn't be read: the screens then count their list only.
   */
  older: OlderSummary | null;
  /** The person's company team (approvals), null when they work alone. */
  team: MobileTeam | null;
};

export type HomeLoad =
  // Firm staff with no company of their own: their place is /firm.
  | { kind: "firm_only" }
  // With askAboutFirmSeat: a firm added this confirmed address as staff and
  // it has no company yet. /app/firm-join asks "Join <firm>?" — being added
  // never makes anyone a member by itself (any firm admin can add any
  // address).
  | { kind: "firm_pending"; firmName: string }
  // With askAboutFirmSeat: a client company asked this confirmed address to
  // be its accountant, and it has no company yet. /app/firm-request answers
  // it; creating a company first would make the account a company account,
  // which can't accept (one account, one role: src/lib/account-roles.ts).
  | { kind: "firm_request_pending"; inviteId: string }
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
 * The country of a company created on this load: what the person picked
 * at sign-up on the website (user_metadata.country), else guessed from
 * their own request (website or iPhone app; src/lib/country.ts). Most
 * companies are created here; one made first by another flow (an
 * accountant invite, a firm's join link, "Not me" on firm-join) takes the
 * sign-up choice too, else starts Swedish. Null when nothing says.
 */
async function newCompanyCountry(user: User): Promise<string | null> {
  const chosen = chosenCountry(user);
  if (chosen) return chosen;
  try {
    const h = await headers();
    return guessCountry({
      ipCountry: h.get("x-vercel-ip-country"),
      acceptLanguage: h.get("accept-language"),
      email: user.email,
    });
  } catch {
    return guessCountry({ email: user.email });
  }
}

/**
 * The oldest open request from a client company asking this confirmed
 * address to be its accountant (firm_clients, direction 'client'), or null.
 * Read-only; a failed read counts as none (the company is then created as
 * before, and accepting refuses with a reason).
 */
async function findOpenClientRequest(user: User): Promise<string | null> {
  const email = normalizedSessionEmail(user);
  if (!email) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select("id, invite_expires_at")
    .eq("invited_email", email)
    .eq("direction", "client")
    .eq("status", "invited")
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) {
    console.error("[home] client request lookup failed", error.code);
    return null;
  }
  const open = (data ?? []).find((r) => !isInviteExpired(r.invite_expires_at as string | null));
  return open ? (open.id as string) : null;
}

/**
 * The signed-in user's home screen. `sessionId` is Stripe Checkout's
 * ?session_id on the website's return; the app passes null.
 */
export async function loadHome(
  user: User,
  sessionId: string | null,
  // A user with a waiting firm seat and no company is asked whether to join
  // before a company is created for them: a company account can't join a
  // firm afterwards (one account, one role: src/lib/account-roles.ts). Both
  // the website and the iPhone app (which says to join on the web) ask.
  { askAboutFirmSeat = false }: { askAboutFirmSeat?: boolean } = {}
): Promise<HomeLoad> {
  // Everything the screen reads, at once rather than one query after the
  // other. All reads: nothing is created until the checks below pass. The
  // profile (alias) and company (currency) are read here too, so a normal
  // load needs only one more round: converting amounts and summing older
  // receipts, side by side.
  const [firmMembership, gate, loadedReceipts, profile, accountantInvites, existingOrg, employment, team] =
    await Promise.all([
      getFirmMembership(user.id),
      checkSubscriptionGate(user.id, sessionId),
      loadReceiptsForUser(user.id),
      loadProfileBits(user.id),
      loadPendingInvites(user),
      readDefaultOrganization(user.id),
      // An employee's receipts are in their employer's currency.
      getEmployment(user.id).catch(() => null),
      loadHomeTeam(user.id),
    ]);

  // Checked before the gate's answer and before any lazy mint below.
  if (firmMembership && !(await hasAnyMembership(user.id))) return { kind: "firm_only" };
  // A firm added this confirmed address as staff and it has no company of
  // its own yet (no default organisation, the first load): ask before
  // anything is created (AGENTS.md, firm portal rule 4). Without this the
  // accountant would get a "My company" minted below, or be sent to
  // /subscribe. Someone who already has a company keeps it and sees
  // "Join <firm>" in Settings.
  if (askAboutFirmSeat && !firmMembership && !existingOrg) {
    const [seat, request] = await Promise.all([findPendingFirmSeat(user), findOpenClientRequest(user)]);
    if ((seat || request) && !(await hasAnyMembership(user.id))) {
      if (seat) return { kind: "firm_pending", firmName: seat.firmName };
      if (request) return { kind: "firm_request_pending", inviteId: request };
    }
  }
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
  // (firm portal), minted only the first time. A failed alias mint leaves
  // the address null (the screens say to reload; the old u-xxxx@ concierge
  // address isn't routed); a failed company mint falls back to the insert
  // trigger, and SEK.
  const [aliasHash, homeCurrency] = await Promise.all([
    profile.aliasHash ?? getOrCreateAliasForUser(user.id),
    employment
      ? homeCurrencyOf(employment.organizationId)
      : existingOrg
        ? existingOrg.currency
        : newCompanyCountry(user).then((country) =>
            getOrCreateDefaultOrganization(user.id, { country }).then((id) => homeCurrencyOf(id))
          ),
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
      forwardingEmail: aliasHash ? buildForwardingAddress(aliasHash) : null,
      showOnboarding: !onboarded && loadedReceipts.length === 0,
      accountantInvites,
      homeCurrency,
      older,
      team,
    },
  };
}
