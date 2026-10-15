// POST /api/account/delete — the in-app "Delete account" (App Store
// guideline 5.1.1(v); launch plan action 44). Settings asks the customer to
// download their receipts first and to type DELETE; this route checks it
// again and runs deleteAccount() (src/lib/account-deletion.ts).
//
// Guards, in order: signed in, same-origin (a cross-site form can't trigger
// it), rate limit, explicit confirmation, and a fresh sign-in *in this
// session* (the token's amr time) — a session left open on a shared
// computer must not be enough to wipe an account.
// No subscription check on purpose: a lapsed customer can always delete.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { getServerUser } from "@/lib/supabase-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import {
  AccountDeletionError,
  deleteAccount,
  isFreshSignIn,
  sessionAuthTime,
} from "@/lib/account-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Stripe calls plus listing and removing every stored file.
export const maxDuration = 60;

const BodySchema = z.object({ confirm: z.literal("DELETE") });

function isSameHost(origin: string, host: string | null): boolean {
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Browsers always send Origin on cross-site POSTs.
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const limited = await rateLimit("accountDelete", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!BodySchema.safeParse(raw).success) {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!isFreshSignIn(sessionAuthTime(claimsData?.claims))) {
    return NextResponse.json({ error: "reauth_required" }, { status: 401 });
  }

  try {
    await deleteAccount(user.id, { email: user.email });
  } catch (err) {
    const step = err instanceof AccountDeletionError ? err.step : "unknown";
    console.error("[/api/account/delete] failed", { step });
    Sentry.captureException(err, { tags: { area: "account-delete", step } });
    return NextResponse.json(
      { error: "Couldn't delete your account. Please try again, or email support@unreceipt.com." },
      { status: 500 },
    );
  }

  // The auth user is gone; clear the session cookies on the way out.
  const response = NextResponse.json({ ok: true });
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set({ name: cookie.name, value: "", maxAge: 0 });
    }
  }
  return response;
}
