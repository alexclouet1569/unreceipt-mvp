import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { appUrl } from "@/lib/app-url";
import { isPilotMode } from "@/lib/pilot";
import { founderReplyTo, sendEmail } from "@/lib/email/send";
import { waitlistEmail } from "@/lib/email/templates";

// "Notify me" on the landing page. public.waitlist has RLS on and no
// policies, so the write goes through the service-role client — the anon
// key can neither read nor insert (which is what silently broke this form
// in production).

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

const JOIN_URL_FALLBACK = "https://app.unreceipt.com/app/login";

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }
  const email = parsed.data.email;

  const { error } = await getSupabaseAdmin().from("waitlist").insert({
    email,
    signed_up_at: new Date().toISOString(),
    source: "landing_page",
  });

  // 23505 = unique_violation on waitlist.email — already signed up. Say so,
  // and don't send the email a second time.
  if (error?.code === "23505") {
    return NextResponse.json(
      { message: "You're already on the list!" },
      { status: 200 }
    );
  }
  if (error) {
    console.error("Waitlist insert error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  // A failed email never fails the signup — it's logged in sendEmail().
  const joinUrl = appUrl("/app/login");
  const replyTo = founderReplyTo();
  await sendEmail({
    to: email,
    ...waitlistEmail({
      joinUrl: joinUrl.startsWith("http") ? joinUrl : JOIN_URL_FALLBACK,
      pilotMode: isPilotMode(),
      canReply: replyTo !== null,
    }),
    replyTo,
    tag: "waitlist",
  });

  return NextResponse.json(
    { message: "Welcome to the waitlist!" },
    { status: 201 }
  );
}
