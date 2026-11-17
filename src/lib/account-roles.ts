// SERVER-ONLY. One account, one role (founder decision 2026-11-17).
//
// An account is either a company account (it owns or works for a company:
// a row in `memberships`) or an accounting-firm account (a claimed seat in
// `firm_members`), never both. An accounting firm that also wants to keep
// its own receipts uses a second account with another email address.
// The only exception is an account listed in `account_role_exemptions`
// (the founder's test account), added by hand in the SQL editor.
//
// The app checks here first, so each screen can say why; the database
// refuses the same writes (2026-11-17 block in supabase/schema.sql), so a
// route that forgets can't create a mixed account.
//
// Never import this file from a "use client" component: it uses the
// service-role Supabase client.

import { getSupabaseAdmin } from "./supabase-admin";

/** "ok": allowed. "blocked": the account has the other role. "error": couldn't read. */
export type RoleCheck = "ok" | "blocked" | "error";

/** Error code a route answers when a company account tries to become firm staff. */
export const COMPANY_ACCOUNT = "company_account";
/** Error code a route answers when a firm account tries to get a company. */
export const FIRM_ACCOUNT = "firm_account";

export const COMPANY_ACCOUNT_MESSAGE =
  "This account is for a company's own receipts, so it can't also work for an accounting firm. Use a different email address for your firm work.";
export const FIRM_ACCOUNT_MESSAGE =
  "This account is for an accounting firm, so it can't also keep a company's own receipts. Use a different email address for your company.";

async function exists(table: string, userId: string): Promise<boolean | null> {
  const { count, error } = await getSupabaseAdmin()
    .from(table)
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error(`[account-roles] ${table} read failed`, error.code);
    return null;
  }
  return (count ?? 0) > 0;
}

/** Whether `userId` may become what `otherRole` names, given what it already is. */
async function check(userId: string, otherRole: "memberships" | "firm_members"): Promise<RoleCheck> {
  const [has, exempt] = await Promise.all([
    exists(otherRole, userId),
    exists("account_role_exemptions", userId),
  ]);
  if (has === null) return "error";
  if (!has) return "ok";
  if (exempt === null) return "error";
  return exempt ? "ok" : "blocked";
}

/** May this account claim a firm seat or create a firm? Blocked for a company account. */
export function checkMayJoinFirm(userId: string): Promise<RoleCheck> {
  return check(userId, "memberships");
}

/** May this account own or join a company? Blocked for a firm account. */
export function checkMayHaveCompany(userId: string): Promise<RoleCheck> {
  return check(userId, "firm_members");
}
