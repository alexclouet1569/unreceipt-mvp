// SERVER-ONLY. The checks every /api/team route makes first (2026-11-15):
// a cross-site page must not act with someone's session (Origin, when the
// browser sends one, names this host; a write is JSON, which a cross-site
// form can't send without a preflight we never grant), the caller is signed
// in (cookie on the website, bearer token from the iPhone app), and the
// teamAction / teamInvite rate limit.

import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { isSameHost } from "../same-origin";
import { getServerUser } from "../supabase-server";
import { rateLimit, rateLimitedResponse, type RateLimitName } from "../rate-limit";

export const NO_STORE = { "Cache-Control": "private, no-store" };

export async function teamGuard(
  request: NextRequest,
  opts: { write: boolean; limit?: RateLimitName }
): Promise<{ ok: true; user: User } | { ok: false; response: Response }> {
  if (opts.write) {
    const origin = request.headers.get("origin");
    if (origin && !isSameHost(origin, request.headers.get("host"))) {
      return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
    }
    if (request.method !== "DELETE") {
      const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (type !== "application/json") {
        return { ok: false, response: NextResponse.json({ error: "unsupported_media_type" }, { status: 415 }) };
      }
    }
  }
  const user = await getServerUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (opts.limit) {
    const limited = await rateLimit(opts.limit, user.id);
    if (!limited.ok) return { ok: false, response: rateLimitedResponse(limited.retryAfterSeconds) };
  }
  return { ok: true, user };
}

/** A library refusal as the route's answer. */
export function refusal(r: { status: number; error: string }): Response {
  return NextResponse.json({ error: r.error }, { status: r.status, headers: NO_STORE });
}

/** The JSON body, or null when it isn't JSON. */
export async function jsonBody(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => null);
}
