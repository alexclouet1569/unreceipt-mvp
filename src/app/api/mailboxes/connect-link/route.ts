// POST /api/mailboxes/connect-link { provider } — the iPhone app's way into
// "Connect Gmail/Outlook". The app is signed in with a bearer token, but the
// OAuth flow runs in the system sign-in sheet, which has no session; this
// returns a 5-minute link (HMAC-signed, bound to the user, the provider and
// a random jti, src/lib/mailboxes/link-token.ts) that the app opens there.
// The link shows a confirmation page first; it never goes straight to the
// provider (see /api/mailboxes/connect/[provider]).
//
// 401 signed out · 403 cross-site · 400 bad body · 404 unknown or
// unconfigured provider · 429 rate-limited · 409 { error: "limit" } at 5
// mailboxes · 200 { url, expiresAt }.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { absoluteAppUrl } from "@/lib/app-url";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { linkSecretConfigured, signConnectLink } from "@/lib/mailboxes/link-token";
import { configuredProvider } from "@/lib/mailboxes/providers";
import { CONNECTION_LIMIT, countConnections } from "@/lib/mailboxes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ provider: z.string().max(32) });

export async function POST(request: NextRequest) {
  // The app sends no Origin; a browser always does on a cross-site POST.
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const provider = configuredProvider(parsed.data.provider);
  if (!provider || !linkSecretConfigured()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const limited = await rateLimit("mailboxConnectLink", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    if ((await countConnections(user.id)) >= CONNECTION_LIMIT) {
      return NextResponse.json({ error: "limit", limit: CONNECTION_LIMIT }, { status: 409 });
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "link_count" } });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const { token, expiresAt } = signConnectLink({ userId: user.id, provider: provider.id });
  const url = absoluteAppUrl(`/api/mailboxes/connect/${provider.id}?link=${encodeURIComponent(token)}`);
  return NextResponse.json(
    { url, expiresAt: new Date(expiresAt).toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
