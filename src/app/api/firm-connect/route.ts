// POST /api/firm-connect { code } — a client says "Yes, share" on an
// accounting firm's join link (/app/connect/<code>, src/lib/firm/join-link.ts).
// Signed in (cookie or the iPhone app's bearer), same-origin, rate limited.
// The code only names the firm; the caller connects their own default
// company and nobody else's (src/lib/firm/connect.ts). An unknown, replaced
// or turned-off code answers 404.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { isJoinCodeShape, loadJoinTarget } from "@/lib/firm/join-link";
import { connectToFirm } from "@/lib/firm/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ code: z.string().max(64) });

const NO_STORE = { "Cache-Control": "private, no-store" };

const REFUSALS = {
  unconfirmed: { status: 403, message: "Confirm your email address first, then open the link again." },
  join_firm_first: {
    status: 409,
    message: "Your address was added to an accounting firm's staff. Join that firm or say it isn't you first.",
  },
  own_firm: { status: 409, message: "This is your own firm's link. Share it with your clients." },
  firm_account: {
    status: 409,
    message:
      "This account is for an accounting firm, so it can't also have a company. Sign in with another email address of yours.",
  },
  already: { status: 409, message: "Your company already shares its receipts with this firm." },
  other_firm: {
    status: 409,
    message: "Your company is already connected to another accounting firm. Stop sharing with it in Settings first.",
  },
  failed: { status: 500, message: "Couldn't connect. Try again." },
} as const;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isJoinCodeShape(parsed.data.code)) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }

  const limited = await rateLimit("firmConnect", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const target = await loadJoinTarget(parsed.data.code);
    if (!target) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    const result = await connectToFirm(user, target);
    if (result.ok) return NextResponse.json({ ok: true, firmName: target.firmName }, { headers: NO_STORE });
    const refusal = REFUSALS[result.reason];
    return NextResponse.json({ error: result.reason, message: refusal.message }, { status: refusal.status, headers: NO_STORE });
  } catch (err) {
    console.error("[/api/firm-connect] failed", err instanceof Error ? err.message : "error");
    Sentry.captureException(err, { tags: { area: "firm connect" } });
    return NextResponse.json({ error: "failed", message: REFUSALS.failed.message }, { status: 500, headers: NO_STORE });
  }
}
