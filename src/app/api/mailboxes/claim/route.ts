// POST /api/mailboxes/claim { code } — the iPhone app's last step of
// "Connect Gmail/Outlook". The OAuth callback never saves an app flow's
// mailbox (the sign-in sheet has no session to say who approved): it parks
// the grant and sends unreceipt://mailboxes?status=claim&code=…&provider=…
// to the device that approved (src/lib/mailboxes/parked.ts). The app posts
// that code here with its own bearer token.
//
// The parked grant is taken out of the table first (single use). It is
// saved only when the signed-in user is the one who minted the connect
// link; anyone else (a victim whose app received an attacker's flow) gets
// 403 and the grant is revoked at the provider. Saving is the website
// callback's own path (completeConnection(): the 5-mailbox cap, the row,
// push notifications, the 30-day backfill in after()).
//
// Same-origin like the other session routes; Origin is optional because the
// app (bearer) sends none.
//
// 403 { error: "forbidden" } cross-site · 401 { error: "unauthorized" } ·
// 429 rate-limited · 400 { error: "invalid" } bad body ·
// 404 { error: "invalid" } unknown or already used code ·
// 410 { error: "expired" } (grant revoked) ·
// 403 { error: "wrong_account" } (grant revoked) ·
// 409 { error: "limit", limit } (grant revoked) ·
// 500 { error: "server_error" } ·
// 200 { ok: true, connection } (MailboxConnectionSummary, no token).

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { completeConnection } from "@/lib/mailboxes/complete";
import { parkedRefreshToken, revokeParked, takeParked } from "@/lib/mailboxes/parked";
import { getProvider } from "@/lib/mailboxes/providers";
import { CONNECTION_LIMIT, toSummary } from "@/lib/mailboxes/store";
import { isMailboxProviderId } from "@/lib/mailboxes/types";
import type { MobileMailboxClaim } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The first backfill runs in after() within this budget, as in the callback.
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };
const BodySchema = z.object({ code: z.string().max(128) });

const answer = (body: MobileMailboxClaim | { error: "forbidden" | "unauthorized" }, status: number) =>
  NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return answer({ error: "forbidden" }, 403);
  }

  const user = await getServerUser();
  if (!user) return answer({ error: "unauthorized" }, 401);

  const limited = await rateLimit("mailboxClaim", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return answer({ error: "invalid" }, 400);

  const supabase = getSupabaseAdmin();
  const taken = await takeParked(supabase, parsed.data.code);
  if (!taken.ok) {
    Sentry.captureMessage("mailbox parked lookup failed", { tags: { area: "mailboxes", step: "parked_take" } });
    return answer({ error: "server_error" }, 500);
  }
  const row = taken.row;
  if (!row || !isMailboxProviderId(row.provider)) return answer({ error: "invalid" }, 404);

  if (Date.parse(row.expires_at) <= Date.now()) {
    await revokeParked(row);
    return answer({ error: "expired" }, 410);
  }

  if (row.user_id !== user.id) {
    // The flow was started from someone else's connect link: whoever
    // approved must not hand their mailbox to that account.
    await revokeParked(row);
    Sentry.captureMessage("mailbox claim by another user refused", {
      level: "warning",
      tags: { area: "mailboxes", step: "claim_wrong_account", provider: row.provider },
    });
    return answer({ error: "wrong_account" }, 403);
  }

  let refreshToken: string;
  try {
    refreshToken = parkedRefreshToken(row);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "parked_decrypt", provider: row.provider } });
    return answer({ error: "server_error" }, 500);
  }

  const done = await completeConnection({
    provider: getProvider(row.provider),
    userId: user.id,
    email: row.email,
    refreshToken,
    accessToken: null,
    startedAt,
    maxDurationSeconds: maxDuration,
    supabase,
  });
  if (!done.ok) {
    if (done.reason === "limit") return answer({ error: "limit", limit: CONNECTION_LIMIT }, 409);
    return answer({ error: "server_error" }, 500);
  }
  return answer({ ok: true, connection: toSummary(done.conn) }, 200);
}
