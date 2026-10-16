// Finishes a sign-in that happened in the browser with an email code
// (supabase.auth.verifyOtp). The email's link goes through /auth/callback,
// which mirrors the sign-up details into public.profiles and queues the
// welcome email; a code never touches the server, so the login form POSTs
// here right after it succeeds to get the same two things.
//
// Both steps are idempotent (profile upsert, welcome email sent once per
// user), so a repeat call — or one after /auth/callback already ran — is
// harmless. It only ever acts on the signed-in caller's own account.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { syncProfile } from "@/lib/profile-sync";
import { scheduleWelcomeEmail } from "@/lib/welcome-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Same-origin only: browsers always send Origin on cross-site POSTs.
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  try {
    await syncProfile(user.id, user.user_metadata ?? null);
    // Only to a proven inbox: if email confirmation were ever switched off,
    // anyone could sign up with someone else's address.
    if (user.email_confirmed_at) scheduleWelcomeEmail(user);
  } catch (err) {
    console.error("[auth/finish] profile sync failed", err);
    Sentry.captureException(err, { tags: { area: "auth/finish" } });
  }

  return NextResponse.json({ ok: true });
}

function isSameHost(origin: string, host: string | null): boolean {
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}
