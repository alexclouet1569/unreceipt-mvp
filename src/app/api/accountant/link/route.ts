// DELETE /api/accountant/link — a client disconnects its accounting firm.
// The link must be active and belong to one of the caller's organisations.

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
    .eq("status", "active")
    .in("organization_id", organizationIds)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[/api/accountant/link] revoke failed", error.code);
    return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
