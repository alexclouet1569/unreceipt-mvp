// Nuclear cookie-clear endpoint. Called from /app/login when the page
// detects stale sb-* cookies (deleted user, rotated JWT, chunked cookies
// supabase-js failed to fully overwrite). Runs supabase.auth.signOut()
// against a writable response so the clearing Set-Cookie headers
// actually reach the browser, and additionally deletes any leftover
// sb-* cookies the SDK didn't touch (chunked variants, etc).

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const response = NextResponse.json({ cleared: true });
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          response.cookies.set({ name, value, ...options });
        }
      },
    },
  });

  await supabase.auth.signOut().catch(() => {});

  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-")) {
      response.cookies.delete(c.name);
    }
  }

  return response;
}
