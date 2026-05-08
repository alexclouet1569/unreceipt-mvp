// SERVER-ONLY. The `/app` subscription gate.
//
// Critical-gap fix #2 (locked plan): if the subscriptions query throws
// — Supabase hiccup, network blip, anything — fail OPEN with a warning
// banner. Don't block a paying customer because of a transient backend
// issue. We log via console.error today; Sentry instrumentation lands
// in step 11.

import { getSupabaseAdmin } from "./supabase-admin";
import { isPilotMode } from "./pilot";

export type GateResult =
  | { kind: "allow" }
  | { kind: "allow_with_warning"; reason: "db_error" | "pilot_mode" }
  | { kind: "redirect_subscribe" }
  | { kind: "self_heal"; sessionId: string };

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function checkSubscriptionGate(
  userId: string,
  sessionIdFromUrl: string | null
): Promise<GateResult> {
  // Pilot mode bypass: takes precedence over everything else (including
  // active subs) so the gate's behavior matches the env var unambiguously.
  if (isPilotMode()) {
    return { kind: "allow_with_warning", reason: "pilot_mode" };
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("subscriptions")
      .select("status, current_period_end, trial_end")
      .eq("user_id", userId)
      // Most recent row wins. Customers can churn-and-resubscribe; the
      // latest sub is the one that matters for gating.
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // TODO(step-11): Sentry.captureException(error, { tags: { area: "gate" } });
      console.error("[gate] subscriptions query failed", error);
      return { kind: "allow_with_warning", reason: "db_error" };
    }

    if (data && ACTIVE_STATUSES.has(data.status)) {
      return { kind: "allow" };
    }

    if (!data && sessionIdFromUrl) {
      return { kind: "self_heal", sessionId: sessionIdFromUrl };
    }

    return { kind: "redirect_subscribe" };
  } catch (err) {
    // TODO(step-11): Sentry.captureException(err, { tags: { area: "gate" } });
    console.error("[gate] threw", err);
    return { kind: "allow_with_warning", reason: "db_error" };
  }
}
