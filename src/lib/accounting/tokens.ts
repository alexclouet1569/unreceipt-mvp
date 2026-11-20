// SERVER-ONLY. An access token for a connected company (Fortnox service
// account): client credentials + the company's TenantId, cached in memory
// on this instance until a minute before it expires. Nothing is stored, so
// there is nothing to rotate or lock: two instances asking at once each get
// a valid token. When Fortnox refuses (the company removed UnReceipt in
// Fortnox → Integrationer), the connection is marked needs_reconnect.

import * as Sentry from "@sentry/nextjs";
import type { AccountingConnection } from "@/lib/types";
import { clientCredentialsToken, FortnoxOAuthError, type FortnoxGrant } from "./fortnox/oauth";

const EARLY_MS = 60_000;
const cache = new Map<string, { token: string; expiresAt: number }>();

export class ReconnectRequiredError extends Error {
  constructor() {
    super("the Fortnox connection must be reconnected");
    this.name = "ReconnectRequiredError";
  }
}

export class TokenUnavailableError extends Error {
  constructor(readonly reason: "gone" | "provider") {
    super(`no Fortnox access token (${reason})`);
    this.name = "TokenUnavailableError";
  }
}

export type TokenDeps = {
  /** Called when Fortnox says the company's consent is gone (only for the tenant and grant asked for). */
  markNeedsReconnect: (conn: Pick<AccountingConnection, "id" | "tenant_id" | "grant_id">) => Promise<void>;
  fetchToken?: (tenantId: string) => Promise<FortnoxGrant>;
  now?: () => number;
  /** After a 401: drop the cached token and ask again. */
  forceRefresh?: boolean;
};

export function _resetTokenCacheForTests(): void {
  cache.clear();
}

/** Forget a connection's cached token (disconnect, reconnect). */
export function forgetAccessToken(connectionId: string): void {
  for (const key of cache.keys()) if (key.startsWith(`${connectionId}:`)) cache.delete(key);
}

export async function getAccessToken(
  conn: Pick<AccountingConnection, "id" | "tenant_id" | "grant_id" | "status">,
  deps: TokenDeps,
): Promise<string> {
  if (conn.status !== "active") throw new ReconnectRequiredError();
  const now = deps.now ?? Date.now;
  // Keyed by the tenant too: a reconnect to another company never reuses a token.
  const key = `${conn.id}:${conn.tenant_id}`;
  if (deps.forceRefresh) cache.delete(key);
  const hit = cache.get(key);
  if (hit && hit.expiresAt - EARLY_MS > now()) return hit.token;

  const fetchToken = deps.fetchToken ?? ((tenantId: string) => clientCredentialsToken(tenantId));
  let grant: FortnoxGrant;
  try {
    grant = await fetchToken(conn.tenant_id);
  } catch (err) {
    if (err instanceof FortnoxOAuthError && err.code === "consent_gone") {
      cache.delete(key);
      await deps.markNeedsReconnect(conn).catch((markErr) =>
        Sentry.captureException(markErr, { tags: { area: "accounting", step: "mark_reconnect" } }),
      );
      throw new ReconnectRequiredError();
    }
    if (err instanceof FortnoxOAuthError && err.code === "not_configured") throw err;
    if (err instanceof FortnoxOAuthError && err.code === "bad_response") {
      // Our integration's setup (secret, grant types), not the company: loud.
      Sentry.captureMessage("fortnox: token request refused (check the integration)", {
        level: "fatal",
        tags: { area: "accounting", step: "client_credentials" },
      });
    }
    throw new TokenUnavailableError("provider");
  }
  cache.set(key, { token: grant.accessToken, expiresAt: grant.expiresAt });
  return grant.accessToken;
}
