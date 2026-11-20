// The firm's batch view of a client's bookings (firm portal rule 2).
//
// GET  /api/firm/clients/<orgId>/booking — confirmed receipts not booked
//      yet, each with the agent's state; proposals are built for up to 25
//      receipts that have none yet (the company's Fortnox is read once,
//      cached), so "Ready to post" fills in as the accountant works.
// POST /api/firm/clients/<orgId>/booking { items: [{ receiptId, account,
//      expectedUpdatedAt }] } (≤ 50) — approves each proposal as shown and
//      posts them one by one after the answer (after()); the client page
//      re-reads the states.
//
// Scoped by the organisation requireFirmClientAccess() returned and by
// firmVisible(); a receipt outside it is skipped like a foreign id.

import * as Sentry from "@sentry/nextjs";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getProposals } from "@/lib/accounting/proposals";
import { BookingError, approveAndPost, loadBookingView, postApproved, proposalView } from "@/lib/accounting/service";
import { firmVisible } from "@/lib/firm/visibility";
import { rateLimit } from "@/lib/rate-limit";
import { FirmAuthError, firmAuthResponse, isUuid, requireFirmClientAccess, requireFirmMember } from "@/lib/require-firm";
import { isSameHost } from "@/lib/same-origin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { BookingProposalRow, Receipt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUILD_PER_CALL = 25;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const BodySchema = z.object({
  items: z
    .array(
      z.object({
        receiptId: z.string().refine(isUuid),
        account: z.string().regex(/^[0-9]{4}$/),
        expectedUpdatedAt: z.string().min(10).max(40),
        paidBy: z.enum(["employee", "company"]).optional(),
      }),
    )
    .min(1)
    .max(50),
});

type Ctx = { params: Promise<{ orgId: string }> };

async function guard(orgId: string) {
  try {
    const ctx = await requireFirmMember();
    const access = await requireFirmClientAccess(ctx.firmId, orgId);
    return { ctx, access } as const;
  } catch (err) {
    if (err instanceof FirmAuthError) return { error: firmAuthResponse(err) } as const;
    throw err;
  }
}

async function readyReceipts(organizationId: string, ids?: string[]): Promise<Receipt[]> {
  let q = getSupabaseAdmin()
    .from("receipts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "verified");
  if (ids) q = q.in("id", ids);
  else q = q.is("booked_at", null);
  const { data, error } = await firmVisible(q).order("created_at", { ascending: false }).limit(ids ? 50 : 100);
  if (error) throw new BookingError("unavailable");
  return (data ?? []) as Receipt[];
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const g = await guard((await params).orgId);
  if ("error" in g) return g.error;
  const limited = await rateLimit("bookingView", g.ctx.user.id);
  if (!limited.ok) return json({ error: "rate_limited" }, 429);

  try {
    const receipts = await readyReceipts(g.access.organizationId);
    const existing = new Map((await getProposals(receipts.map((r) => r.id))).map((p) => [p.receipt_id, p]));
    const items = [];
    // The chart of accounts once, not once per receipt.
    let accounts: Array<{ number: string; name: string }> = [];
    let built = 0;
    let more = false;
    for (const receipt of receipts) {
      const row = existing.get(receipt.id);
      let state: unknown = row ? { kind: "proposal", proposal: proposalView(row) } : null;
      if (!row || row.status === "proposed" || row.status === "failed") {
        if (built < BUILD_PER_CALL) {
          built += 1;
          const view = await loadBookingView(receipt, g.ctx.user.id);
          if (view.kind === "proposal") {
            if (view.accounts.length > 0) accounts = view.accounts;
            state = { kind: "proposal", proposal: view.proposal, canApprove: view.canApprove };
          } else {
            state = view;
          }
        } else {
          more = true;
        }
      }
      items.push({
        receiptId: receipt.id,
        merchant: receipt.merchant_name,
        paidBy: receipt.paid_by ?? null,
        total: receipt.total,
        currency: receipt.currency,
        state,
      });
      const kind = (state as { kind?: string } | null)?.kind;
      // Not connected or unavailable: every other receipt would say the same.
      if (
        kind === "not_connected" ||
        kind === "needs_reconnect" ||
        kind === "confirm_company" ||
        kind === "not_configured" ||
        kind === "unavailable"
      ) {
        return json({ connection: kind, items: [], more: false });
      }
    }
    return json({ connection: "active", items, accounts, more });
  } catch (err) {
    if (err instanceof BookingError) return json({ error: "unavailable" }, 503);
    Sentry.captureException(err, { tags: { area: "accounting", step: "firm_batch_view" } });
    return json({ error: "server_error" }, 500);
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) return json({ error: "forbidden" }, 403);
  const g = await guard((await params).orgId);
  if ("error" in g) return g.error;
  const limited = await rateLimit("bookingApprove", g.ctx.user.id);
  if (!limited.ok) return json({ error: "rate_limited" }, 429);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);

  let receipts: Map<string, Receipt>;
  try {
    receipts = new Map((await readyReceipts(g.access.organizationId, parsed.data.items.map((i) => i.receiptId))).map((r) => [r.id, r]));
  } catch {
    return json({ error: "unavailable" }, 503);
  }

  const approved: BookingProposalRow[] = [];
  const refused: Array<{ receiptId: string; error: string; blocks?: string[] }> = [];
  for (const item of parsed.data.items) {
    const receipt = receipts.get(item.receiptId);
    if (!receipt) {
      refused.push({ receiptId: item.receiptId, error: "not_found" });
      continue;
    }
    try {
      approved.push(
        await approveAndPost({
          receipt,
          userId: g.ctx.user.id,
          account: item.account,
          expectedUpdatedAt: item.expectedUpdatedAt,
          paidBy: item.paidBy ?? null,
          post: false,
        }),
      );
    } catch (err) {
      if (err instanceof BookingError) {
        refused.push({ receiptId: item.receiptId, error: err.code, blocks: err.blocks.length ? err.blocks : undefined });
        // The connection is gone or Fortnox is down: the rest would fail too.
        if (["not_connected", "needs_reconnect", "confirm_company", "unavailable"].includes(err.code)) break;
      } else {
        Sentry.captureException(err, { tags: { area: "accounting", step: "firm_batch_approve" } });
        refused.push({ receiptId: item.receiptId, error: "server_error" });
      }
    }
  }

  // Posting one by one after the answer; anything left (a timeout, a crash)
  // is picked up by the daily job, which never posts a voucher twice.
  if (approved.length > 0) {
    after(async () => {
      for (const row of approved) {
        try {
          await postApproved(row);
        } catch (err) {
          Sentry.captureException(err, { tags: { area: "accounting", step: "firm_batch_post" } });
        }
      }
    });
  }
  return json({ approved: approved.map((r) => r.receipt_id), refused });
}
