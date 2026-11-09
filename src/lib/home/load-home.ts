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
import type { Receipt } from "@/lib/types";

export const RECENT_RECEIPTS_LIMIT = 50;

export type PendingInvite = { id: string; firmName: string };

export type HomeData = {
  receipts: Receipt[];
  forwardingEmail: string;
  showOnboarding: boolean;
  accountantInvites: PendingInvite[];
  homeCurrency: string;
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
    .limit(RECENT_RECEIPTS_LIMIT);

  if (error) {
    Sentry.captureException(error, { tags: { area: "home load" } });
    console.error("[home] receipts load failed", error);
    return [];
  }
  return (data ?? []) as Receipt[];
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

// First-run onboarding shows until finished or skipped. A failed read (or
// the column not existing yet) counts as done: never trap someone in it.
async function loadOnboarded(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return true;
  return Boolean(data?.onboarded_at);
}

/**
 * The signed-in user's home screen. `sessionId` is Stripe Checkout's
 * ?session_id on the website's return; the app passes null.
 */
export async function loadHome(user: User, sessionId: string | null): Promise<HomeLoad> {
  // Everything the screen reads, at once rather than one query after the
  // other. All reads: nothing is created until the checks below pass.
  const [firmMembership, gate, loadedReceipts, onboarded, accountantInvites] =
    await Promise.all([
      getFirmMembership(user.id),
      checkSubscriptionGate(user.id, sessionId),
      loadReceiptsForUser(user.id),
      loadOnboarded(user.id),
      loadPendingInvites(user),
    ]);

  // Checked before the gate's answer and before any lazy mint below.
  if (firmMembership && !(await hasAnyMembership(user.id))) return { kind: "firm_only" };
  if (gate.kind === "redirect_subscribe") return { kind: "subscribe" };
  if (gate.kind === "self_heal") return { kind: "self_heal", sessionId: gate.sessionId };

  // Mint (or fetch) the user's forwarding alias: the live MX address that
  // routes to /api/intake/email. Falls back to the legacy concierge
  // derivation if the profile row is missing.
  const [aliasHash, organizationId] = await Promise.all([
    getOrCreateAliasForUser(user.id),
    // The company this account's receipts belong to (firm portal). Minted
    // here so it exists before the first receipt; failures fall back to the
    // insert trigger.
    getOrCreateDefaultOrganization(user.id),
  ]);
  // Amounts in the company's currency next to foreign ones (src/lib/fx.ts).
  // Best effort: a missing rate leaves the receipt unconverted.
  const homeCurrency = await homeCurrencyOf(organizationId);
  const receipts = await ensureHomeAmounts(loadedReceipts, homeCurrency).catch((err) => {
    console.error("[home] currency conversion failed", err);
    return loadedReceipts;
  });

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
    },
  };
}
