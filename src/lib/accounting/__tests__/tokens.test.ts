import { beforeAll, describe, expect, it, vi } from "vitest";
import { encryptAccountingToken, decryptAccountingToken } from "@/lib/accounting/crypto";
import { FortnoxOAuthError, type FortnoxTokens } from "@/lib/accounting/fortnox/oauth";
import { getAccessToken, ReconnectRequiredError, type TokenStore } from "@/lib/accounting/tokens";
import type { AccountingConnection } from "@/lib/types";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const ORG = "org-1";
const NOW = Date.parse("2026-11-20T10:00:00Z");

beforeAll(() => {
  process.env.INTEGRATION_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
});

function memoryStore(row: Partial<AccountingConnection>) {
  const state: AccountingConnection = {
    id: "conn-1",
    organization_id: ORG,
    provider: "fortnox",
    refresh_token_enc: encryptAccountingToken("refresh-1", ORG),
    access_token_enc: null,
    access_expires_at: null,
    refresh_lock_until: null,
    refreshed_at: new Date(NOW).toISOString(),
    status: "active",
    company_name: null,
    company_org_number: null,
    connected_by: null,
    grant_id: "grant-1",
    confirmed_at: null,
    confirmed_by: null,
    last_error: null,
    created_at: "",
    updated_at: "",
    ...row,
  };
  const store: TokenStore = {
    async read() {
      return { ...state };
    },
    async claimLock(_id, expected, nowIso, untilIso) {
      if (state.status !== "active" || state.refresh_token_enc !== expected) return false;
      if (state.refresh_lock_until && state.refresh_lock_until >= nowIso) return false;
      state.refresh_lock_until = untilIso;
      return true;
    },
    async saveTokens(_id, expected, values) {
      if (state.refresh_token_enc !== expected || !state.refresh_lock_until) return false;
      Object.assign(state, values, { refresh_lock_until: null });
      return true;
    },
    async releaseLock() {
      state.refresh_lock_until = null;
    },
    async markNeedsReconnect(_id, code) {
      state.status = "needs_reconnect";
      state.last_error = code;
    },
  };
  return { state, store };
}

function tokens(n: number): FortnoxTokens {
  return { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresAt: NOW + 3600_000, scopes: [] };
}

const instant = async () => undefined;

describe("getAccessToken", () => {
  it("uses a stored access token that is still valid", async () => {
    const { store } = memoryStore({
      access_token_enc: encryptAccountingToken("access-0", ORG),
      access_expires_at: new Date(NOW + 30 * 60_000).toISOString(),
    });
    const refresh = vi.fn();
    await expect(getAccessToken("conn-1", { store, refresh, now: () => NOW })).resolves.toBe("access-0");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and stores the rotated pair", async () => {
    const { store, state } = memoryStore({
      access_token_enc: encryptAccountingToken("access-0", ORG),
      access_expires_at: new Date(NOW + 30_000).toISOString(),
    });
    const refresh = vi.fn(async (rt: string) => {
      expect(rt).toBe("refresh-1");
      return tokens(2);
    });
    await expect(getAccessToken("conn-1", { store, refresh, now: () => NOW, sleep: instant })).resolves.toBe("access-2");
    expect(decryptAccountingToken(state.refresh_token_enc, ORG)).toBe("refresh-2");
    expect(state.refresh_lock_until).toBeNull();
  });

  it("refreshes once when two callers need a token at the same time", async () => {
    const { store } = memoryStore({});
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const refresh = vi.fn(async () => {
      await gate;
      return tokens(3);
    });
    const a = getAccessToken("conn-1", { store, refresh, now: () => NOW, sleep: () => new Promise((r) => setTimeout(r, 1)) });
    const b = getAccessToken("conn-1", { store, refresh, now: () => NOW, sleep: () => new Promise((r) => setTimeout(r, 1)) });
    await new Promise((r) => setTimeout(r, 5));
    release();
    await expect(Promise.all([a, b])).resolves.toEqual(["access-3", "access-3"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("marks the connection for reconnecting when Fortnox refuses the refresh token", async () => {
    const { store, state } = memoryStore({});
    const refresh = vi.fn(async () => {
      throw new FortnoxOAuthError("invalid_grant");
    });
    await expect(getAccessToken("conn-1", { store, refresh, now: () => NOW })).rejects.toBeInstanceOf(ReconnectRequiredError);
    expect(state.status).toBe("needs_reconnect");
  });

  it("gives back the new grant when the connection was replaced during the refresh", async () => {
    const { store, state } = memoryStore({});
    const refresh = vi.fn(async () => {
      // A reconnect lands meanwhile.
      state.refresh_token_enc = encryptAccountingToken("refresh-other", ORG);
      return tokens(5);
    });
    const revoke = vi.fn(async () => true);
    await expect(getAccessToken("conn-1", { store, refresh, revoke, now: () => NOW, sleep: instant })).rejects.toMatchObject({
      reason: "gone",
    });
    expect(revoke).toHaveBeenCalledWith("refresh-5");
    expect(decryptAccountingToken(state.refresh_token_enc, ORG)).toBe("refresh-other");
  });

  it("after a 401, refreshes instead of reusing the refused token", async () => {
    const { store } = memoryStore({
      access_token_enc: encryptAccountingToken("access-0", ORG),
      access_expires_at: new Date(NOW + 30 * 60_000).toISOString(),
    });
    const refresh = vi.fn(async () => tokens(4));
    await expect(getAccessToken("conn-1", { store, refresh, now: () => NOW, forceRefresh: true })).resolves.toBe("access-4");
  });
});
