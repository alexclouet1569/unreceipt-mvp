// PATCH /api/receipts/[id]/claim — saves how a receipt goes on the
// person's expense claim (/app/claims): type, place, purpose. Each is
// optional; null or "" clears it, so the claim screen goes back to its own
// suggestion.
//
// Kept apart from PATCH /api/receipts/[id] on purpose: these fields aren't
// facts of the receipt, so saving them must not count as an edit, re-run
// the review status or touch the plan usage.
//
// Service-role write, scoped to the user inline (.eq("user_id")), like the
// PDF route: users have no direct UPDATE on receipts.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  CLAIM_TYPE_KEYS,
  MAX_CLAIM_PLACE,
  MAX_CLAIM_PURPOSE,
} from "@/lib/claims/claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

const ClaimPatchSchema = z
  .object({
    claim_type: z.enum(CLAIM_TYPE_KEYS).nullable().optional(),
    claim_place: optionalText(MAX_CLAIM_PLACE, `The place can be at most ${MAX_CLAIM_PLACE} characters`),
    claim_purpose: optionalText(
      MAX_CLAIM_PURPOSE,
      `The purpose can be at most ${MAX_CLAIM_PURPOSE} characters`,
    ),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = ClaimPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const update: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) update[key] = value;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, claim_type, claim_place, claim_purpose")
    .maybeSingle();

  if (error) {
    console.error("[/api/receipts/claim] update failed", error.code);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, claim: data });
}
