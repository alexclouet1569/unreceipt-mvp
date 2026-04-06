import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { email } = await request.json();
  const supabase = getSupabase();

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 }
    );
  }

  // Check if already subscribed
  const { data: existing } = await supabase
    .from("waitlist")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (existing) {
    return NextResponse.json(
      { message: "You're already on the waitlist!" },
      { status: 200 }
    );
  }

  // Insert new signup
  const { error } = await supabase.from("waitlist").insert({
    email: email.toLowerCase().trim(),
    signed_up_at: new Date().toISOString(),
    source: "landing_page",
  });

  if (error) {
    console.error("Waitlist insert error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  // Send welcome email via Resend
  if (process.env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "UnReceipt <onboarding@resend.dev>",
          to: email.toLowerCase().trim(),
          subject: "Welcome to UnReceipt — You're on the list!",
          html: getWelcomeEmailHtml(),
        }),
      });
    } catch (emailError) {
      // Don't fail the waitlist signup if email fails
      console.error("Welcome email error:", emailError);
    }
  }

  return NextResponse.json(
    { message: "Welcome to the waitlist!" },
    { status: 201 }
  );
}

function getWelcomeEmailHtml(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f8faf8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; width: 48px; height: 48px; background-color: #27BE7B; border-radius: 12px; line-height: 48px; color: white; font-size: 22px; font-weight: 700;">U</div>
      <h1 style="margin: 12px 0 0; font-size: 24px; color: #303568;">UnReceipt</h1>
    </div>

    <!-- Main card -->
    <div style="background: white; border-radius: 16px; padding: 36px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <h2 style="margin: 0 0 16px; font-size: 22px; color: #303568;">You're on the list!</h2>

      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #555;">
        Thanks for joining UnReceipt. We're building the simplest way for businesses to manage expense receipts — no new cards, no spreadsheets, no lost paper.
      </p>

      <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #555;">
        Here's what UnReceipt will do for your team:
      </p>

      <!-- Benefits -->
      <div style="margin-bottom: 24px;">
        <div style="display: flex; align-items: flex-start; margin-bottom: 12px;">
          <span style="color: #27BE7B; font-size: 18px; margin-right: 10px;">&#10003;</span>
          <span style="font-size: 14px; color: #444;"><strong>Smart notifications</strong> — We detect payments from your bank and ping employees within minutes</span>
        </div>
        <div style="display: flex; align-items: flex-start; margin-bottom: 12px;">
          <span style="color: #27BE7B; font-size: 18px; margin-right: 10px;">&#10003;</span>
          <span style="font-size: 14px; color: #444;"><strong>One-tap capture</strong> — Snap the receipt while it's still in your pocket, not weeks later</span>
        </div>
        <div style="display: flex; align-items: flex-start; margin-bottom: 12px;">
          <span style="color: #27BE7B; font-size: 18px; margin-right: 10px;">&#10003;</span>
          <span style="font-size: 14px; color: #444;"><strong>No card switch</strong> — Works with your existing corporate cards. Zero migration</span>
        </div>
        <div style="display: flex; align-items: flex-start;">
          <span style="color: #27BE7B; font-size: 18px; margin-right: 10px;">&#10003;</span>
          <span style="font-size: 14px; color: #444;"><strong>Finance dashboard</strong> — Real-time compliance tracking, no more chasing receipts at month-end</span>
        </div>
      </div>

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

      <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #555;">
        We'll reach out as soon as early access is ready. In the meantime, you can explore the interactive demo:
      </p>

      <div style="text-align: center;">
        <a href="https://unreceipt.com/demo/employee" style="display: inline-block; background-color: #27BE7B; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">Try the Demo</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px;">
      <p style="font-size: 12px; color: #999; margin: 0;">
        UnReceipt &mdash; Paper is Past
      </p>
      <p style="font-size: 12px; color: #999; margin: 4px 0 0;">
        &copy; 2026 UnReceipt. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
