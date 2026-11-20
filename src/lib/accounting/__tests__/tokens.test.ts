import { beforeEach, describe, expect, it, vi } from "vitest";
import { FortnoxOAuthError, type FortnoxGrant } from "@/lib/accounting/fortnox/oauth";
import { _resetTokenCacheForTests, forgetAccessToken, getAccessToken, ReconnectRequiredError } from "@/lib/accounting/tokens";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const NOW = Date.parse("2026-11-20T10:00:00Z");
const CONN = { id: "conn-1", tenant_id: "1234567", grant_id: "grant-1", status: "active" as const };

function grant(n: number, ttlMs = 3_600_000): FortnoxGrant {
  return { accessToken: `access-${n}`, refreshToken: null, expiresAt: NOW + ttlMs, scopes: [] };
}

describe("getAccessToken (service account: client credentials + TenantId)", () => {
  beforeEach(() => _resetTokenCacheForTests());

  it("asks Fortnox with the company's TenantId and reuses the token until a minute before it expires", async () => {
    const fetchToken = vi.fn(async () => grant(1));
    const markNeedsReconnect = vi.fn();
    let now = NOW;
    const deps = { fetchToken, markNeedsReconnect, now: () => now };
    await expect(getAccessToken(CONN, deps)).resolves.toBe("access-1");
    await expect(getAccessToken(CONN, deps)).resolves.toBe("access-1");
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(fetchToken).toHaveBeenCalledWith("1234567");
    now = NOW + 3_600_000 - 30_000;
    fetchToken.mockResolvedValueOnce(grant(2, 2 * 3_600_000));
    await expect(getAccessToken(CONN, deps)).resolves.toBe("access-2");
  });

  it("never reuses a token for another Fortnox company or after a forced refresh", async () => {
    const fetchToken = vi.fn(async (tenant: string) => grant(tenant === "999" ? 9 : 1));
    const deps = { fetchToken, markNeedsReconnect: vi.fn(), now: () => NOW };
    await getAccessToken(CONN, deps);
    await expect(getAccessToken({ ...CONN, tenant_id: "999" }, deps)).resolves.toBe("access-9");
    fetchToken.mockResolvedValueOnce(grant(3));
    await expect(getAccessToken(CONN, { ...deps, forceRefresh: true })).resolves.toBe("access-3");
    forgetAccessToken("conn-1");
    await getAccessToken(CONN, deps);
    expect(fetchToken).toHaveBeenCalledTimes(4);
  });

  it("marks the connection for reconnecting when the company removed UnReceipt in Fortnox", async () => {
    const markNeedsReconnect = vi.fn(async () => undefined);
    const fetchToken = vi.fn(async () => {
      throw new FortnoxOAuthError("consent_gone");
    });
    await expect(getAccessToken(CONN, { fetchToken, markNeedsReconnect, now: () => NOW })).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
    // Only for the tenant and grant asked for: a reconnect meanwhile stays active.
    expect(markNeedsReconnect).toHaveBeenCalledWith(CONN);
  });

  it("doesn't blame the company for Fortnox being down", async () => {
    const markNeedsReconnect = vi.fn();
    const fetchToken = vi.fn(async () => {
      throw new FortnoxOAuthError("unavailable");
    });
    await expect(getAccessToken(CONN, { fetchToken, markNeedsReconnect, now: () => NOW })).rejects.toMatchObject({
      reason: "provider",
    });
    expect(markNeedsReconnect).not.toHaveBeenCalled();
  });

  it("refuses a connection that needs reconnecting without asking Fortnox", async () => {
    const fetchToken = vi.fn();
    await expect(
      getAccessToken({ ...CONN, status: "needs_reconnect" }, { fetchToken, markNeedsReconnect: vi.fn() }),
    ).rejects.toBeInstanceOf(ReconnectRequiredError);
    expect(fetchToken).not.toHaveBeenCalled();
  });
});
