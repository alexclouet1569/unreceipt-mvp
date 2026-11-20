// SERVER-ONLY. A usable Fortnox access token for a connection.
//
// Fortnox rotates the refresh token on every refresh and the old one dies,
// so two instances refreshing at once would leave one connection with a
// dead token. Hence:
//   1. a stored access token still valid for a minute is used as is;
//   2. otherwise one caller takes the lock (compare-and-set on
//      refresh_lock_until AND the refresh token it read), refreshes, and
//      saves the new pair before anyone uses it;
//   3. everyone else waits and re-reads the row.
// A refused refresh (invalid_grant) marks the connection needs_reconnect.

import * as Sentry from "@sentry/nextjs";
import type { AccountingConnection } from "@/lib/types";
import { decryptAccountingToken, encryptAccountingToken } from "./crypto";
import { FortnoxOAuthError, refreshTokens as defaultRefresh, type FortnoxTokens } from "./fortnox/oauth";

const EARLY_MS = 60_000;
const LOCK_MS = 30_000;
const WAIT_MS = 500;
const MAX_ROUNDS = 40;

export type TokenStore = {
  read(id: string): Promise<AccountingConnection | null>;
  claimLock(id: string, expectedRefreshEnc: string, nowIso: string, untilIso: string): Promise<boolean>;
  saveTokens(
    id: string,
    values: { refresh_token_enc: string; access_token_enc: string; access_expires_at: string; refreshed_at: string },
  ): Promise<void>;
  releaseLock(id: string): Promise<void>;
  markNeedsReconnect(id: string, code: string): Promise<void>;
};

export class ReconnectRequiredError extends Error {
  constructor() {
    super("the Fortnox connection must be reconnected");
    this.name = "ReconnectRequiredError";
  }
}

export class TokenUnavailableError extends Error {
  constructor(readonly reason: "gone" | "busy" | "provider") {
    super(`no Fortnox access token (${reason})`);
    this.name = "TokenUnavailableError";
  }
}

export type TokenDeps = {
  store: TokenStore;
  refresh?: (refreshToken: string) => Promise<FortnoxTokens>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Force a refresh even when the stored access token looks valid (after a 401). */
  forceRefresh?: boolean;
};

export async function getAccessToken(connectionId: string, deps: TokenDeps): Promise<string> {
  const { store } = deps;
  const refresh = deps.refresh ?? ((t: string) => defaultRefresh(t));
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const force = deps.forceRefresh ?? false;
  let staleAccess: string | null = null;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const row = await store.read(connectionId);
    if (!row) throw new TokenUnavailableError("gone");
    if (row.status !== "active") throw new ReconnectRequiredError();
    const ctx = row.organization_id;

    if (row.access_token_enc && row.access_expires_at) {
      const valid = Date.parse(row.access_expires_at) - EARLY_MS > now();
      // After a 401 the stored token is the one refused: only a different
      // one (someone else's refresh, or ours) will do.
      if (force && staleAccess === null) staleAccess = row.access_token_enc;
      if (valid && row.access_token_enc !== staleAccess) {
        return decryptAccountingToken(row.access_token_enc, ctx);
      }
    }

    const t = now();
    const claimed = await store.claimLock(
      connectionId,
      row.refresh_token_enc,
      new Date(t).toISOString(),
      new Date(t + LOCK_MS).toISOString(),
    );
    if (!claimed) {
      await sleep(WAIT_MS);
      continue;
    }

    let tokens: FortnoxTokens;
    try {
      tokens = await refresh(decryptAccountingToken(row.refresh_token_enc, ctx));
    } catch (err) {
      if (err instanceof FortnoxOAuthError && err.code === "invalid_grant") {
        await store.markNeedsReconnect(connectionId, "refresh_refused").catch((markErr) =>
          Sentry.captureException(markErr, { tags: { area: "accounting", step: "mark_reconnect" } }),
        );
        throw new ReconnectRequiredError();
      }
      await store.releaseLock(connectionId).catch(() => undefined);
      throw new TokenUnavailableError("provider");
    }

    // The old refresh token is dead from here on: saving the new one is the
    // only way the connection survives. Retry a few times before giving up.
    const values = {
      refresh_token_enc: encryptAccountingToken(tokens.refreshToken, ctx),
      access_token_enc: encryptAccountingToken(tokens.accessToken, ctx),
      access_expires_at: new Date(tokens.expiresAt).toISOString(),
      refreshed_at: new Date(now()).toISOString(),
    };
    let saved = false;
    for (let i = 0; i < 3 && !saved; i++) {
      try {
        await store.saveTokens(connectionId, values);
        saved = true;
      } catch (err) {
        if (i === 2) {
          console.error("[accounting] rotated Fortnox token not saved");
          Sentry.captureException(err, { tags: { area: "accounting", step: "token_rotate" }, level: "fatal" });
        } else {
          await sleep(200);
        }
      }
    }
    return tokens.accessToken;
  }
  throw new TokenUnavailableError("busy");
}
