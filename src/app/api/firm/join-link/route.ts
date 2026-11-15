// POST /api/firm/join-link { action: "replace" | "off" } — a firm admin makes
// a new join link (every shared or printed one stops working) or turns it
// off (src/lib/firm/join-link.ts). requireFirmMember() first; the firm comes
// from the session, never the body; staff get 403.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmMember } from "@/lib/require-firm";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { absoluteAppUrl } from "@/lib/app-url";
import { joinPath, replaceJoinCode, turnOffJoinLink } from "@/lib/firm/join-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ action: z.enum(["replace", "off"]) });

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let ctx;
  try {
    ctx = await requireFirmMember();
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Only an admin of your firm can change its link." }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const limited = await rateLimit("firmJoinLink", ctx.user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    if (parsed.data.action === "off") {
      await turnOffJoinLink(ctx.firmId);
      return NextResponse.json({ ok: true, url: null });
    }
    const code = await replaceJoinCode(ctx.firmId);
    return NextResponse.json({ ok: true, url: absoluteAppUrl(joinPath(code)) });
  } catch (err) {
    console.error("[/api/firm/join-link] failed", err instanceof Error ? err.message : "error");
    return NextResponse.json({ error: "Couldn't change the link. Try again." }, { status: 500 });
  }
}
