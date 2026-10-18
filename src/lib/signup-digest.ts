// SERVER-ONLY (service role). Nightly founder email listing who signed up
// for the pilot (new accounts and waitlist entries) in the last 24 hours,
// with how far each new account got, so the founder can reach out while
// they still remember signing up. Run by /api/cron/signup-digest.
//
// - Nothing is sent on a day without signups.
// - The window ends at the start of the current UTC hour. Vercel Hobby fires
//   a daily cron anywhere inside its scheduled hour, so consecutive runs
//   cover back-to-back windows: nobody is listed twice or skipped.
// - Admin accounts (CONCIERGE_ADMIN_EMAILS) are left out: they're the
//   founder's own test sign-ups.
// - Sent to the first admin address only (founderReplyTo()).

import { getSupabaseAdmin } from "./supabase-admin";
import { isAdminEmail } from "./auth-admin";
import { founderReplyTo, sendEmail } from "./email/send";
import { signupDigestEmail, type DigestSignup, type DigestWaitlistEntry } from "./email/templates";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PAGE = 1000;
// One email can't usefully list more; the total line still counts them all.
export const MAX_LISTED = 50;

export function digestWindow(now: Date): { start: Date; end: Date } {
  const end = new Date(Math.floor(now.getTime() / HOUR) * HOUR);
  return { start: new Date(end.getTime() - DAY), end };
}

function inWindow(iso: string | null | undefined, w: { start: Date; end: Date }): boolean {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) && t >= w.start.getTime() && t < w.end.getTime();
}

type AuthUser = {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string };
  user_metadata?: { full_name?: unknown; company_name?: unknown };
};

async function newAccounts(w: { start: Date; end: Date }): Promise<{ users: AuthUser[]; total: number }> {
  const db = getSupabaseAdmin();
  const found: AuthUser[] = [];
  let total = 0;
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`listUsers failed (${error.status ?? "unknown"})`);
    const users = (data?.users ?? []) as AuthUser[];
    for (const u of users) {
      if (isAdminEmail(u.email)) continue;
      total++;
      if (inWindow(u.created_at, w)) found.push(u);
    }
    if (users.length < PAGE) break;
  }
  found.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return { users: found, total };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

async function describe(users: AuthUser[]): Promise<DigestSignup[]> {
  if (users.length === 0) return [];
  const db = getSupabaseAdmin();
  const ids = users.map((u) => u.id);

  const [profiles, receipts, addresses] = await Promise.all([
    db.from("profiles").select("user_id, full_name, company_name, onboarded_at").in("user_id", ids),
    db.from("receipts").select("user_id, source").in("user_id", ids),
    db.from("user_email_addresses").select("user_id").in("user_id", ids),
  ]);
  if (profiles.error) throw new Error(`profiles read failed (${profiles.error.code})`);
  if (receipts.error) throw new Error(`receipts read failed (${receipts.error.code})`);
  if (addresses.error) throw new Error(`addresses read failed (${addresses.error.code})`);

  const profileBy = new Map((profiles.data ?? []).map((p) => [p.user_id as string, p]));
  const photo = new Map<string, number>();
  const email = new Map<string, number>();
  for (const r of receipts.data ?? []) {
    const bucket = r.source === "email" ? email : photo;
    bucket.set(r.user_id as string, (bucket.get(r.user_id as string) ?? 0) + 1);
  }
  const addressCount = new Map<string, number>();
  for (const a of addresses.data ?? []) {
    addressCount.set(a.user_id as string, (addressCount.get(a.user_id as string) ?? 0) + 1);
  }

  return users.map((u) => {
    const p = profileBy.get(u.id);
    return {
      email: u.email ?? "",
      fullName: text(p?.full_name) ?? text(u.user_metadata?.full_name),
      companyName: text(p?.company_name) ?? text(u.user_metadata?.company_name),
      signedUpAt: new Date(u.created_at),
      confirmed: Boolean(u.email_confirmed_at),
      provider: u.app_metadata?.provider ?? "email",
      lastSignInAt: u.last_sign_in_at ? new Date(u.last_sign_in_at) : null,
      onboarded: Boolean(p?.onboarded_at),
      photoReceipts: photo.get(u.id) ?? 0,
      emailReceipts: email.get(u.id) ?? 0,
      ownAddresses: addressCount.get(u.id) ?? 0,
    };
  });
}

async function newWaitlist(w: { start: Date; end: Date }): Promise<DigestWaitlistEntry[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("waitlist")
    .select("email, source, signed_up_at")
    .gte("signed_up_at", w.start.toISOString())
    .lt("signed_up_at", w.end.toISOString())
    .order("signed_up_at", { ascending: true })
    .limit(MAX_LISTED);
  if (error) throw new Error(`waitlist read failed (${error.code})`);
  return (data ?? []).map((r) => ({
    email: r.email as string,
    source: text(r.source),
    signedUpAt: new Date(r.signed_up_at as string),
  }));
}

export type SignupDigestResult =
  | { sent: false; reason: "no_signups" | "no_recipient" | "send_failed"; accounts: number; waitlist: number }
  | { sent: true; accounts: number; waitlist: number };

export async function runSignupDigest(now: Date = new Date()): Promise<SignupDigestResult> {
  const w = digestWindow(now);
  const { users, total } = await newAccounts(w);
  const waitlist = await newWaitlist(w);
  const counts = { accounts: users.length, waitlist: waitlist.length };
  if (users.length === 0 && waitlist.length === 0) return { sent: false, reason: "no_signups", ...counts };

  const to = founderReplyTo();
  if (!to) return { sent: false, reason: "no_recipient", ...counts };

  const signups = await describe(users.slice(0, MAX_LISTED));
  const email = signupDigestEmail({
    signups,
    moreSignups: users.length - signups.length,
    waitlist,
    totalAccounts: total,
  });
  const result = await sendEmail({ to, ...email, tag: "signup_digest" });
  return result.ok ? { sent: true, ...counts } : { sent: false, reason: "send_failed", ...counts };
}
