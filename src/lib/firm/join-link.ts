// SERVER-ONLY. A firm's own join link (2026-11-15): app.unreceipt.com/app/
// connect/<code>, put on the firm's website, email signature or onboarding
// letter, or shown as a QR code. A client who opens it, signed in, is asked
// "Share your receipts with <firm>?" and connects only by saying yes
// (POST /api/firm-connect). Unlike an invite, the code needs no email match:
// the owner of the data is the one consenting, and the firm learns nothing
// until they do. Because a firm's name is typed by whoever made it, the
// question also shows the domain of the firm admin's email, so a client can
// tell "Bergström Redovisning" at bergstrom.se from a look-alike at
// gmail.com.
//
// The code is meant to be shared, so it is stored as is (firms.join_code,
// readable by the firm's members only). Any member's /firm/clients makes
// one the first time (compare-and-set on NULL); an admin can replace it
// (the old link stops working) or turn it off.

import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** 16 random bytes as base64url: 22 characters (schema check firms_join_code_shape). */
export function mintJoinCode(): string {
  return randomBytes(16).toString("base64url");
}

export function isJoinCodeShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22}$/.test(value);
}

export function joinPath(code: string): string {
  return `/app/connect/${code}`;
}

// Free mailbox providers: an admin address there says nothing about who runs
// the firm, and the page says so instead of naming the domain as the firm's.
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.se",
  "hotmail.fr",
  "live.com",
  "live.se",
  "live.fr",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.se",
  "yahoo.fr",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "gmx.com",
  "gmx.fr",
  "orange.fr",
  "free.fr",
  "laposte.net",
  "telia.com",
  "spray.se",
]);

/** What the client is told about who runs the firm: its admin's email domain. */
export type AdminDomain = { domain: string; personal: boolean } | null;

export function adminDomainOf(email: string | null | undefined): AdminDomain {
  const domain = (email ?? "").split("@")[1]?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return { domain, personal: PERSONAL_DOMAINS.has(domain) };
}

export type JoinTarget = { firmId: string; firmName: string; adminDomain: AdminDomain };

export class JoinLinkError extends Error {}

/** The firm a join code belongs to, or null (unknown, turned off or replaced). */
export async function loadJoinTarget(code: string): Promise<JoinTarget | null> {
  if (!isJoinCodeShape(code)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("firms").select("id, name").eq("join_code", code).maybeSingle();
  if (error) throw new JoinLinkError(error.message);
  if (!data) return null;
  // The firm's first admin who has signed in (as the weekly reminder's
  // Reply-To): a claimed seat's address matched a confirmed session email.
  // A waiting seat is only an address someone typed, so it never vouches for
  // the firm (security review 2026-11-15).
  const { data: admin, error: adminError } = await db
    .from("firm_members")
    .select("email")
    .eq("firm_id", data.id)
    .eq("role", "admin")
    .not("user_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (adminError) throw new JoinLinkError(adminError.message);
  return {
    firmId: data.id as string,
    firmName: data.name as string,
    adminDomain: adminDomainOf(admin?.email as string | undefined),
  };
}

/**
 * The firm's code, made the first time it is asked for. Null when an admin
 * turned the link off, or when it can't be read (the column isn't there yet,
 * a database error): the panel then says the link isn't available.
 */
export async function ensureJoinCode(firmId: string): Promise<{ code: string | null; off: boolean }> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("firms")
    .select("join_code, join_code_created_at")
    .eq("id", firmId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[join-link] read failed", error.code);
    return { code: null, off: false };
  }
  if (data.join_code) return { code: data.join_code as string, off: false };
  // Turned off by an admin: a created_at without a code.
  if (data.join_code_created_at) return { code: null, off: true };
  const code = mintJoinCode();
  const { data: made, error: makeError } = await db
    .from("firms")
    .update({ join_code: code, join_code_created_at: new Date().toISOString() })
    .eq("id", firmId)
    .is("join_code", null)
    .is("join_code_created_at", null)
    .select("join_code")
    .maybeSingle();
  if (makeError) {
    console.error("[join-link] create failed", makeError.code);
    return { code: null, off: false };
  }
  if (made?.join_code) return { code: made.join_code as string, off: false };
  // Another member's page made it a moment ago.
  const { data: again } = await db.from("firms").select("join_code").eq("id", firmId).maybeSingle();
  return { code: (again?.join_code as string | null) ?? null, off: false };
}

/** An admin replaces the code (every printed or shared link stops working). */
export async function replaceJoinCode(firmId: string): Promise<string> {
  const code = mintJoinCode();
  const { error } = await getSupabaseAdmin()
    .from("firms")
    .update({ join_code: code, join_code_created_at: new Date().toISOString() })
    .eq("id", firmId);
  if (error) throw new JoinLinkError(error.message);
  return code;
}

/** An admin turns the link off: no code, so every link answers "doesn't work". */
export async function turnOffJoinLink(firmId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("firms")
    .update({ join_code: null, join_code_created_at: new Date().toISOString() })
    .eq("id", firmId);
  if (error) throw new JoinLinkError(error.message);
}
