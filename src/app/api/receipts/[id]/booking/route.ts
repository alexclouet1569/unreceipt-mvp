// GET  /api/receipts/<id>/booking — the booking agent's state for a
//      receipt: not connected, what stands in the way, or the proposed
//      voucher (built on first view by someone who may approve), or what
//      was posted.
// POST /api/receipts/<id>/booking { account, expectedUpdatedAt } — approve
//      the proposal the person saw, with the expense account they chose,
//      and post it to the company's Fortnox. 409 when it changed meanwhile
//      or the rules now refuse it.
//
// Who may see it: loadReceiptForActor() (owner, approver, linked firm).
// Who may approve: the linked firm, else an owner (permissions.ts). Owners
// need product access, as for every paid call; firm staff have no plan
// (firm portal rule 3).

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AccountingAccessError } from "@/lib/accounting/permissions";
import { BookingError, approveAndPost, loadBookingView, proposalView } from "@/lib/accounting/service";
import { rateLimit } from "@/lib/rate-limit";
import { loadReceiptForActor, ReceiptAccessError } from "@/lib/receipts/access";
import { isSameHost } from "@/lib/same-origin";
import { hasProductAccess } from "@/lib/subscription-gate";
import { getServerUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Posting renders a PDF when the receipt has no usable original, uploads it
// and makes three Fortnox calls; the model's choice is one Claude call.
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const BodySchema = z.object({
  account: z.string().regex(/^[0-9]{4}$/),
  expectedUpdatedAt: z.string().min(10).max(40),
});

type Ctx = { params: Promise<{ id: string }> };

async function access(id: string) {
  const user = await getServerUser();
  if (!user) return { error: json({ error: "unauthorized" }, 401) } as const;
  if (!z.string().uuid().safeParse(id).success) return { error: json({ error: "not_found" }, 404) } as const;
  try {
    const found = await loadReceiptForActor(user, id);
    if (!found) return { error: json({ error: "not_found" }, 404) } as const;
    if (found.via !== "firm" && !(await hasProductAccess(user.id))) {
      return { error: json({ error: "no_access" }, 403) } as const;
    }
    return { user, found } as const;
  } catch (err) {
    if (err instanceof ReceiptAccessError) return { error: json({ error: "server_error" }, 500) } as const;
    throw err;
  }
}

function bookingErrorResponse(err: BookingError) {
  switch (err.code) {
    case "forbidden":
      return json({ error: "forbidden" }, 403);
    case "rate_limited":
      return json({ error: "rate_limited" }, 429);
    case "changed":
      return json({ error: "changed" }, 409);
    case "blocked":
      return json({ error: "blocked", blocks: err.blocks }, 409);
    case "not_connected":
    case "needs_reconnect":
    case "no_company":
      return json({ error: err.code }, 409);
    default:
      return json({ error: "unavailable" }, 503);
  }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const a = await access((await params).id);
  if ("error" in a) return a.error;
  const limited = await rateLimit("bookingView", a.user.id);
  if (!limited.ok) return json({ error: "rate_limited" }, 429);
  try {
    return json(await loadBookingView(a.found.receipt, a.user.id));
  } catch (err) {
    if (err instanceof BookingError) return bookingErrorResponse(err);
    if (!(err instanceof AccountingAccessError)) Sentry.captureException(err, { tags: { area: "accounting", step: "view" } });
    return json({ error: "server_error" }, 500);
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) return json({ error: "forbidden" }, 403);
  const a = await access((await params).id);
  if ("error" in a) return a.error;
  const limited = await rateLimit("bookingApprove", a.user.id);
  if (!limited.ok) return json({ error: "rate_limited" }, 429);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);

  try {
    const row = await approveAndPost({
      receipt: a.found.receipt,
      userId: a.user.id,
      account: parsed.data.account,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    });
    return json({ proposal: proposalView(row) });
  } catch (err) {
    if (err instanceof BookingError) return bookingErrorResponse(err);
    Sentry.captureException(err, { tags: { area: "accounting", step: "approve" } });
    return json({ error: "server_error" }, 500);
  }
}
