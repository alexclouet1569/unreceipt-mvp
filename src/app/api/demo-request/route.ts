import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { BOOKKEEPING_NAMES, demoBookingUrl } from "@/lib/demo-request";
import { demoRequestSchema } from "@/lib/demo-request-schema";
import { normalizeAddress } from "@/lib/email-address";
import { founderReplyTo, sendEmail } from "@/lib/email/send";
import { demoRequestConfirmationEmail, demoRequestFounderEmail } from "@/lib/email/templates";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isSameHost } from "@/lib/same-origin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// POST /api/demo-request — the contact form on the demo request pages
// (/book-demo, /sv/boka-demo, /fr/demander-une-demo) and at the end of the
// home and audience pages (apex host): a demo request or another request
// (`kind`). Stores the request in public.demo_requests (RLS on, no policies:
// service role only), emails the founder at once with Reply-To the visitor,
// and sends the visitor a fixed confirmation. Only a failed insert is a 5xx:
// a failed email is reported by sendEmail() and the request still counts.
//
// Never log or report what was typed: not the body, not the insert error
// (PostgREST `details` can echo the row), only the Postgres code.

export async function POST(request: NextRequest) {
  // Browsers always send Origin on a cross-site POST; the form posts from
  // its own page. A missing Origin (curl, the founder's own test) is allowed.
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const limited = await rateLimit("demoRequest", clientIp(request));
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const body: unknown = await request.json().catch(() => null);

  // Honeypot first: a bot that filled the hidden field is told it worked,
  // so it doesn't retry with other values. Nothing is stored or sent.
  if (body && typeof body === "object" && "website" in body) {
    const website = (body as { website?: unknown }).website;
    if (typeof website === "string" && website.trim() !== "") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
  }

  const parsed = demoRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))].filter(Boolean);
    return NextResponse.json({ error: "invalid", fields }, { status: 400 });
  }
  const r = parsed.data;

  // A cap on all requests together, counted only for valid ones: a script
  // rotating IPs can't flood the founder's inbox or the table.
  const overall = await rateLimit("demoRequestAll", "all");
  if (!overall.ok) {
    Sentry.captureMessage("Demo requests: daily cap reached", {
      level: "warning",
      tags: { area: "demo_request" },
    });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(overall.retryAfterSeconds) } }
    );
  }

  const { error } = await getSupabaseAdmin().from("demo_requests").insert({
    kind: r.kind,
    locale: r.locale,
    name: r.name,
    company: r.company,
    email: r.email,
    phone: r.phone,
    employees: r.employees,
    bookkeeping: r.bookkeeping,
    has_accountant: r.hasAccountant,
    message: r.message,
  });
  if (error) {
    console.error("[demo-request] insert failed", { code: error.code });
    Sentry.captureMessage("Demo request not saved", {
      level: "error",
      tags: { area: "demo_request", code: error.code ?? "unknown" },
    });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const founder = founderReplyTo();
  const bookingUrl = demoBookingUrl(process.env.NEXT_PUBLIC_DEMO_BOOKING_URL);
  // Per inbox (Gmail dots and +tags folded, as for firm seats), hashed: the
  // counter table never holds the address itself.
  const inbox = normalizeAddress(r.email) ?? r.email;
  const perInbox = await rateLimit(
    "demoRequestConfirm",
    createHash("sha256").update(inbox).digest("hex")
  );
  const confirmAllowed = perInbox.ok
    ? await rateLimit("demoRequestConfirmAll", "all")
    : perInbox;

  const sends: Promise<unknown>[] = [];
  if (founder) {
    sends.push(
      sendEmail({
        to: founder,
        ...demoRequestFounderEmail({
          ...r,
          bookkeeping: r.bookkeeping ? BOOKKEEPING_NAMES[r.bookkeeping] : null,
        }),
        replyTo: r.email,
        tag: "demo_request",
      })
    );
  } else {
    Sentry.captureMessage("Demo request: no founder address (CONCIERGE_ADMIN_EMAILS)", {
      level: "warning",
      tags: { area: "demo_request" },
    });
  }
  if (confirmAllowed.ok) {
    sends.push(
      sendEmail({
        to: r.email,
        ...demoRequestConfirmationEmail({ locale: r.locale, kind: r.kind, bookingUrl, canReply: founder !== null }),
        replyTo: founder,
        tag: "demo_request_confirmation",
      })
    );
  }
  await Promise.all(sends);

  // The page only promises a confirmation email when one was sent.
  return NextResponse.json({ ok: true, confirmation: confirmAllowed.ok }, { status: 201 });
}
