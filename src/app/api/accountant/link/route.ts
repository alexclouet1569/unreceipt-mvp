// DELETE /api/accountant/link — a client stops sharing with its accounting
// firm, or withdraws the invite it sent to an accountant. The link must
// belong to one of the caller's organisations and be active, or be a
// client-sent invite still waiting.
//
// PATCH /api/accountant/link { linkId, weeklyReminders } — the client's
// own on/off for the firm's Monday reminder (src/lib/reminders/weekly.ts).
// Stored apart from the firm's switch, so the firm can't turn it back on.

import { deleteBankLines } from "@/lib/bank/cleanup";
import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isUuid } from "@/lib/require-firm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ linkId: z.string().max(64) });

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUuid(parsed.data.linkId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: memberships, error: memberError } = await db
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id);
  if (memberError) {
    console.error("[/api/accountant/link] memberships failed", memberError.code);
    return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
  }
  const organizationIds = (memberships ?? []).map((m) => m.organization_id as string);
  if (organizationIds.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data, error } = await db
    .from("firm_clients")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), invite_token_hash: null })
    .eq("id", parsed.data.linkId)
    .in("organization_id", organizationIds)
    .or("status.eq.active,and(status.eq.invited,direction.eq.client)")
    .select("id, organization_id")
    .maybeSingle();
  if (error) {
    console.error("[/api/accountant/link] revoke failed", error.code);
    return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // The firm's bank check ends with the link (src/lib/bank/cleanup.ts).
  if (typeof data.organization_id === "string") {
    const lines = await deleteBankLines(db, [data.organization_id]);
    if (!lines.ok) Sentry.captureMessage("bank lines kept after link end", { level: "warning", tags: { area: "bank-cleanup" } });
  }
  return NextResponse.json({ ok: true });
}

const PatchSchema = z.object({ linkId: z.string().max(64), weeklyReminders: z.boolean() });

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUuid(parsed.data.linkId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Owners only: the reminder goes to the owners, and the choice applies
  // to the whole company.
  const db = getSupabaseAdmin();
  const { data: memberships, error: memberError } = await db
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "owner");
  if (memberError) {
    console.error("[/api/accountant/link] memberships failed", memberError.code);
    return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
  }
  const organizationIds = (memberships ?? []).map((m) => m.organization_id as string);
  if (organizationIds.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await db
    .from("firm_clients")
    .update({ reminders_opted_out_at: parsed.data.weeklyReminders ? null : new Date().toISOString() })
    .eq("id", parsed.data.linkId)
    .in("organization_id", organizationIds)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[/api/accountant/link] reminders update failed", error.code);
    return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, weeklyReminders: parsed.data.weeklyReminders });
}
