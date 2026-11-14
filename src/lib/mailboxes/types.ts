// The contract between the mailbox plumbing (OAuth flow, storage, routes in
// /api/mailboxes/*) and each provider. google.ts and microsoft.ts implement
// MailboxProvider; nothing else should know provider details.
// Types and two error classes only: safe to import from tests and routes.

import type { MailboxConnection, MailboxProviderId } from "@/lib/types";

export type { MailboxProviderId };

export const MAILBOX_PROVIDERS: readonly MailboxProviderId[] = ["google", "microsoft"] as const;

export function isMailboxProviderId(value: unknown): value is MailboxProviderId {
  return typeof value === "string" && (MAILBOX_PROVIDERS as readonly string[]).includes(value);
}

/** A connection as adapters see it: never the stored (encrypted) token. */
export type MailboxConnectionRef = Omit<MailboxConnection, "refresh_token_enc">;

export type ExchangedTokens = {
  refreshToken: string;
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  /** The mailbox's own address, as the provider reports it. */
  email: string;
};

export type RefreshedAccessToken = {
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  /** Set when the provider rotated the refresh token (Microsoft does). */
  refreshToken?: string;
};

export type WatchResult = {
  /** Graph subscription id; null for Gmail (its watch has no id). */
  watchId: string | null;
  /** ISO timestamp the watch ends, renewed by the daily job. */
  expiresAt: string | null;
  /** Where to read changes from (Gmail historyId); null to keep the current one. */
  cursor: string | null;
};

export type SyncOptions = {
  /**
   * Set on the first sync after connecting: list the last N days by date
   * instead of reading changes since conn.cursor, then return the cursor
   * to continue from.
   */
  backfillDays?: number;
  /** Stop after this many receipt candidates (full downloads). */
  maxMessages?: number;
  /**
   * Epoch ms by which the sync should have returned (the caller's function
   * budget). The provider starts no new message once one more could not
   * finish, and returns a cursor that resumes there. Absent: no limit.
   */
  deadline?: number;
};

export type SyncResult = {
  /** The cursor to store next; null keeps the current one. */
  cursor: string | null;
  /** Messages fully downloaded and handed to the ingest. */
  processed: number;
  /** Receipts the ingest created. */
  created: number;
};

export interface MailboxProvider {
  readonly id: MailboxProviderId;
  /** The env vars the provider needs are set. Unconfigured providers answer 404. */
  configured(): boolean;
  /** The consent screen URL (PKCE S256, offline access). */
  authUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  /** Code → tokens and the mailbox's own address. Throws on any refusal. */
  exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<ExchangedTokens>;
  /**
   * A fresh access token. Throws ReauthRequiredError when the provider says
   * the grant is revoked or expired (invalid_grant); anything else is a
   * transient failure.
   */
  refreshAccessToken(refreshToken: string): Promise<RefreshedAccessToken>;
  /**
   * Whether revoke() ends the grant at the provider. False for Microsoft,
   * which has no per-token revoke: a disconnect then answers revoked:false
   * and the screens tell the user where to remove the app's access.
   */
  readonly canRevoke: boolean;
  /** Best effort: revoke the grant at the provider. Must not throw on "already revoked". */
  revoke(refreshToken: string): Promise<void>;
  /** Start or renew push notifications for new mail. */
  startWatch(conn: MailboxConnectionRef, accessToken: string): Promise<WatchResult>;
  /** Stop push notifications. Best effort. */
  stopWatch(conn: MailboxConnectionRef, accessToken: string): Promise<void>;
  /**
   * Read new mail since conn.cursor (or the backfill window), pick the
   * receipt-like messages and hand them to the shared ingest
   * (src/lib/email/ingest.ts). Never stores anything about non-receipts.
   * The caller stores the returned cursor with compare-and-set
   * (updateCursor in store.ts).
   */
  sync(conn: MailboxConnectionRef, accessToken: string, opts: SyncOptions): Promise<SyncResult>;
}

/** The provider refused the refresh token: the user must connect again. */
export class ReauthRequiredError extends Error {
  constructor(public readonly provider: MailboxProviderId, message = "reauthorization required") {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

/**
 * The user unticked the mail permission on the consent screen: the grant
 * exists but can't read mail. The callback answers "scope_missing" (the
 * provider has already revoked the partial grant).
 */
export class MissingScopeError extends Error {
  constructor(public readonly provider: MailboxProviderId) {
    super("mail scope not granted");
    this.name = "MissingScopeError";
  }
}

/**
 * A provider call failed. `code` is a short machine code safe to store in
 * mailbox_connections.last_error and to put in a redirect (never the
 * provider's message, which can carry an address).
 */
export class MailboxProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = "MailboxProviderError";
  }
}
