// SERVER-ONLY. Service-role data access for mailbox_connections. The only
// file that reads or writes refresh_token_enc: every read that leaves this
// module uses CONNECTION_COLUMNS, which leaves the token out, and the token
// itself comes out only through getDecryptedToken().
//
// Errors carry the Postgres code only (never row contents).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { MobileMailboxConnection } from "@/lib/mobile/types";
import type { MailboxConnection } from "@/lib/types";
import { decryptToken, encryptToken } from "./crypto";
import type { MailboxConnectionRef, MailboxProviderId } from "./types";

/** At most this many mailboxes per user; the 6th is refused. */
export const CONNECTION_LIMIT = 5;

// Every column except refresh_token_enc.
export const CONNECTION_COLUMNS =
  "id, user_id, provider, email, status, cursor, watch_id, watch_expires_at, last_sync_at, last_receipt_at, last_error, created_at, updated_at";

export class MailboxStoreError extends Error {
  constructor(
    public readonly step: string,
    public readonly code?: string,
  ) {
    super(`mailbox store: ${step} failed${code ? ` (${code})` : ""}`);
    this.name = "MailboxStoreError";
  }
}

/** What the website and the iPhone app see: never the token or the cursor. */
export type MailboxConnectionSummary = MobileMailboxConnection;

export function toSummary(conn: MailboxConnectionRef): MailboxConnectionSummary {
  return {
    id: conn.id,
    provider: conn.provider,
    email: conn.email,
    status: conn.status,
    lastReceiptAt: conn.last_receipt_at,
    lastSyncAt: conn.last_sync_at,
    createdAt: conn.created_at,
  };
}

/** Lowercased, trimmed; null when it isn't a plausible address. */
export function normalizeMailboxEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// The token's AAD context: a token only decrypts on its owner's row.
const tokenContext = (userId: string) => `user:${userId}`;

const db = (supabase?: SupabaseClient) => supabase ?? getSupabaseAdmin();

export async function listConnections(userId: string, supabase?: SupabaseClient): Promise<MailboxConnectionRef[]> {
  const { data, error } = await db(supabase)
    .from("mailbox_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new MailboxStoreError("list", error.code);
  return (data ?? []) as MailboxConnectionRef[];
}

export async function countConnections(userId: string, supabase?: SupabaseClient): Promise<number> {
  const { count, error } = await db(supabase)
    .from("mailbox_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new MailboxStoreError("count", error.code);
  return count ?? 0;
}

/** One connection, scoped to its owner when `userId` is given. */
export async function getConnection(
  id: string,
  { userId, supabase }: { userId?: string; supabase?: SupabaseClient } = {},
): Promise<MailboxConnectionRef | null> {
  let query = db(supabase).from("mailbox_connections").select(CONNECTION_COLUMNS).eq("id", id);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new MailboxStoreError("get", error.code);
  return (data as MailboxConnectionRef | null) ?? null;
}

/**
 * Whether the connection may still be read: its row exists and is active.
 * Asked by the providers before each message download, so a mailbox
 * disconnected (or an account deleted) during a sync stops it at the next
 * message. False on a database error too: the sync stops and a later one
 * resumes from the cursor.
 */
export async function isConnectionLive(connId: string, supabase?: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await db(supabase)
      .from("mailbox_connections")
      .select("status")
      .eq("id", connId)
      .maybeSingle();
    if (error) return false;
    return (data as { status?: string } | null)?.status === "active";
  } catch {
    return false;
  }
}

/** The plaintext refresh token. Throws when the row is gone or unreadable. */
export async function getDecryptedToken(conn: MailboxConnectionRef, supabase?: SupabaseClient): Promise<string> {
  const { data, error } = await db(supabase)
    .from("mailbox_connections")
    .select("refresh_token_enc")
    .eq("id", conn.id)
    .eq("user_id", conn.user_id)
    .maybeSingle();
  if (error) throw new MailboxStoreError("token read", error.code);
  const enc = (data as Pick<MailboxConnection, "refresh_token_enc"> | null)?.refresh_token_enc;
  if (!enc) throw new MailboxStoreError("token read", "missing");
  return decryptToken(enc, tokenContext(conn.user_id));
}

export type SaveConnectionResult =
  | { ok: true; conn: MailboxConnectionRef; created: boolean }
  | { ok: false; error: "limit" | "invalid_email" };

/**
 * Stores a freshly authorised mailbox. The same user, provider and address
 * again replaces the token and makes it active (a reconnect, which doesn't
 * count toward the limit); a new address is refused once the user has
 * CONNECTION_LIMIT mailboxes. Another user may hold the same address: a
 * mailbox belongs to whoever authorised it.
 */
export async function saveConnection(
  input: { userId: string; provider: MailboxProviderId; email: string; refreshToken: string },
  supabase?: SupabaseClient,
): Promise<SaveConnectionResult> {
  const client = db(supabase);
  const email = normalizeMailboxEmail(input.email);
  if (!email) return { ok: false, error: "invalid_email" };
  const refresh_token_enc = encryptToken(input.refreshToken, tokenContext(input.userId));

  const reconnect = async (): Promise<MailboxConnectionRef | null> => {
    const { data, error } = await client
      .from("mailbox_connections")
      .update({ refresh_token_enc, status: "active", last_error: null })
      .eq("user_id", input.userId)
      .eq("provider", input.provider)
      .eq("email", email)
      .select(CONNECTION_COLUMNS);
    if (error) throw new MailboxStoreError("reconnect", error.code);
    return ((data ?? []) as MailboxConnectionRef[])[0] ?? null;
  };

  const existing = await reconnect();
  if (existing) return { ok: true, conn: existing, created: false };

  if ((await countConnections(input.userId, client)) >= CONNECTION_LIMIT) {
    return { ok: false, error: "limit" };
  }

  const { data, error } = await client
    .from("mailbox_connections")
    .insert({
      user_id: input.userId,
      provider: input.provider,
      email,
      refresh_token_enc,
      status: "active",
    })
    .select(CONNECTION_COLUMNS)
    .single();
  if (error) {
    // Two callbacks for the same address at once: the other one inserted.
    if (error.code === "23505") {
      const again = await reconnect();
      if (again) return { ok: true, conn: again, created: false };
    }
    throw new MailboxStoreError("insert", error.code);
  }
  return { ok: true, conn: data as MailboxConnectionRef, created: true };
}

/** A rotated refresh token (Microsoft rotates on every refresh). */
export async function replaceRefreshToken(
  conn: MailboxConnectionRef,
  refreshToken: string,
  supabase?: SupabaseClient,
): Promise<void> {
  const { error } = await db(supabase)
    .from("mailbox_connections")
    .update({ refresh_token_enc: encryptToken(refreshToken, tokenContext(conn.user_id)) })
    .eq("id", conn.id)
    .eq("user_id", conn.user_id);
  if (error) throw new MailboxStoreError("token rotate", error.code);
}

const ERROR_CODE = /^[a-z0-9_]{1,64}$/;
const safeCode = (code: string) => (ERROR_CODE.test(code) ? code : "error");

/**
 * Pauses ('active' → 'paused') or resumes ('paused' → 'active') a
 * connection, compare-and-set on the status so it never overwrites a
 * needs_reconnect set meanwhile. True when this call changed it.
 */
export async function setPaused(connId: string, paused: boolean, supabase?: SupabaseClient): Promise<boolean> {
  const { data, error } = await db(supabase)
    .from("mailbox_connections")
    .update({ status: paused ? "paused" : "active" })
    .eq("id", connId)
    .eq("status", paused ? "active" : "paused")
    .select("id");
  if (error) throw new MailboxStoreError(paused ? "pause" : "resume", error.code);
  return (data ?? []).length > 0;
}

/** The provider refused the grant: the UI asks the user to connect again. */
export async function markNeedsReconnect(
  connId: string,
  code = "reauth_required",
  supabase?: SupabaseClient,
): Promise<void> {
  const { error } = await db(supabase)
    .from("mailbox_connections")
    .update({ status: "needs_reconnect", last_error: safeCode(code) })
    .eq("id", connId);
  if (error) throw new MailboxStoreError("mark reconnect", error.code);
}

/** A short failure code (never message content), or null to clear it. */
export async function recordError(connId: string, code: string | null, supabase?: SupabaseClient): Promise<void> {
  const { error } = await db(supabase)
    .from("mailbox_connections")
    .update({ last_error: code === null ? null : safeCode(code) })
    .eq("id", connId);
  if (error) throw new MailboxStoreError("record error", error.code);
}

/**
 * Saves a started or renewed watch. A `cursor` (Gmail's historyId at watch
 * time) is stored only when given: right after connecting, where nothing
 * else syncs the row yet; renewals leave it out and keep the cursor.
 */
export async function updateWatch(
  connId: string,
  watch: { watchId: string | null; expiresAt: string | null; cursor?: string | null },
  supabase?: SupabaseClient,
): Promise<void> {
  const patch: Record<string, unknown> = { watch_id: watch.watchId, watch_expires_at: watch.expiresAt };
  if (watch.cursor) patch.cursor = watch.cursor;
  const { error } = await db(supabase)
    .from("mailbox_connections")
    .update(patch)
    .eq("id", connId);
  if (error) throw new MailboxStoreError("watch", error.code);
}

/**
 * Moves the cursor from `previous` to `next` only if nobody moved it in
 * between (compare-and-set, null-safe), so two syncs that started from the
 * same cursor can't both advance it: the loser gets false and must not
 * store anything else. Also stamps last_sync_at and, when given,
 * last_receipt_at, and clears last_error.
 */
export async function updateCursor(
  connId: string,
  previous: string | null,
  next: string | null,
  extra: { lastReceiptAt?: string | null; now?: string } = {},
  supabase?: SupabaseClient,
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    cursor: next,
    last_sync_at: extra.now ?? new Date().toISOString(),
    last_error: null,
  };
  if (extra.lastReceiptAt) patch.last_receipt_at = extra.lastReceiptAt;
  let query = db(supabase).from("mailbox_connections").update(patch).eq("id", connId);
  query = previous === null ? query.is("cursor", null) : query.eq("cursor", previous);
  const { data, error } = await query.select("id");
  if (error) throw new MailboxStoreError("cursor", error.code);
  return (data ?? []).length > 0;
}

/** Deletes one connection of its owner. False when there was none. */
export async function deleteConnection(connId: string, userId: string, supabase?: SupabaseClient): Promise<boolean> {
  const { data, error } = await db(supabase)
    .from("mailbox_connections")
    .delete()
    .eq("id", connId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new MailboxStoreError("delete", error.code);
  return (data ?? []).length > 0;
}

/**
 * Connections that still hold their grant and come back by themselves:
 * active ones, and ones paused while their user has no product access
 * (./sync.ts resumes them). needs_reconnect ones hold nothing usable.
 */
export const LIVE_STATUSES = ["active", "paused"] as const;

/**
 * The live connections (active or paused) of one provider for a mailbox
 * address (a push notification names the mailbox, not the user). Several
 * users may have connected the same address; each gets its own sync. A
 * paused one counts too: it keeps the shared grant (./shared-grant.ts), and
 * a push to it resumes it once its user has access again.
 */
export async function findActiveConnectionsByEmail(
  provider: MailboxProviderId,
  rawEmail: string,
  supabase?: SupabaseClient,
): Promise<MailboxConnectionRef[]> {
  const email = normalizeMailboxEmail(rawEmail);
  if (!email) return [];
  const { data, error } = await db(supabase)
    .from("mailbox_connections")
    .select(CONNECTION_COLUMNS)
    .eq("provider", provider)
    .eq("email", email)
    .in("status", [...LIVE_STATUSES]);
  if (error) throw new MailboxStoreError("find by email", error.code);
  return (data ?? []) as MailboxConnectionRef[];
}

/**
 * Every live connection (active or paused), oldest first: the daily job's
 * work list. It pauses or resumes each by its user's access (./sync.ts).
 */
export async function listActiveConnections(supabase?: SupabaseClient): Promise<MailboxConnectionRef[]> {
  const { data, error } = await db(supabase)
    .from("mailbox_connections")
    .select(CONNECTION_COLUMNS)
    .in("status", [...LIVE_STATUSES])
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new MailboxStoreError("list active", error.code);
  return (data ?? []) as MailboxConnectionRef[];
}

/**
 * The live connection (active or paused) of one provider whose push
 * subscription has this id (a Graph change notification names its
 * subscription, not the mailbox). Null for an unknown, replaced,
 * disconnected or needs_reconnect one.
 */
export async function findActiveConnectionByWatchId(
  provider: MailboxProviderId,
  watchId: string,
  supabase?: SupabaseClient,
): Promise<MailboxConnectionRef | null> {
  const { data, error } = await db(supabase)
    .from("mailbox_connections")
    .select(CONNECTION_COLUMNS)
    .eq("provider", provider)
    .eq("watch_id", watchId)
    .in("status", [...LIVE_STATUSES])
    .limit(1);
  if (error) throw new MailboxStoreError("find by watch", error.code);
  return ((data ?? []) as MailboxConnectionRef[])[0] ?? null;
}
