import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authUrl,
  clientCredentialsToken,
  exchangeCode,
  FORTNOX_TOKEN_URL,
  tenantIdFromToken,
} from "@/lib/accounting/fortnox/oauth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

describe("Fortnox OAuth (service account)", () => {
  beforeEach(() => {
    vi.stubEnv("FORTNOX_CLIENT_ID", "client-1");
    vi.stubEnv("FORTNOX_CLIENT_SECRET", "secret-1");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.unreceipt.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("asks for a service account with PKCE and the scopes the agent needs", () => {
    const url = new URL(authUrl("state-1", "challenge-1"));
    expect(url.origin + url.pathname).toBe("https://apps.fortnox.se/oauth-v1/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-1",
      redirect_uri: "https://app.unreceipt.com/api/accounting/fortnox/callback",
      scope: "bookkeeping inbox connectfile companyinformation settings",
      state: "state-1",
      access_type: "offline",
      response_type: "code",
      account_type: "service",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
    });
  });

  it("sends the PKCE verifier with the code exchange and refuses a missing permission", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ access_token: "a", refresh_token: "r", expires_in: 3600, scope: "bookkeeping inbox connectfile companyinformation settings" }),
    );
    await exchangeCode("code-1", "verifier-1", fetchImpl as never);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toMatchObject({
      grant_type: "authorization_code",
      code: "code-1",
      code_verifier: "verifier-1",
    });
    const partial = vi.fn(async () => json({ access_token: "a", expires_in: 3600, scope: "bookkeeping" }));
    await expect(exchangeCode("c", "v", partial as never)).rejects.toMatchObject({ code: "scope_missing" });
  });

  it("gets a token with client credentials and the company's TenantId", async () => {
    const fetchImpl = vi.fn(async () => json({ access_token: "tok", expires_in: 3600 }));
    await expect(clientCredentialsToken("1234567", fetchImpl as never)).resolves.toMatchObject({ accessToken: "tok" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(FORTNOX_TOKEN_URL);
    expect(init.headers).toMatchObject({ TenantId: "1234567", Authorization: `Basic ${Buffer.from("client-1:secret-1").toString("base64")}` });
    expect(new URLSearchParams(String(init.body)).get("grant_type")).toBe("client_credentials");
    await expect(clientCredentialsToken("12a", fetchImpl as never)).rejects.toMatchObject({ code: "bad_response" });
  });

  it("tells a lost consent from our own misconfiguration and from Fortnox being down", async () => {
    await expect(clientCredentialsToken("1", (async () => json({ error: "invalid_grant" }, 400)) as never)).rejects.toMatchObject({
      code: "consent_gone",
    });
    await expect(clientCredentialsToken("1", (async () => json({ error: "invalid_client" }, 401)) as never)).rejects.toMatchObject({
      code: "bad_response",
    });
    // "This client may not use this grant" (service account switched off in
    // the Developer Portal): our setup, never every company's reconnect.
    await expect(
      clientCredentialsToken("1", (async () => json({ error: "unauthorized_client" }, 400)) as never),
    ).rejects.toMatchObject({ code: "bad_response" });
    await expect(clientCredentialsToken("1", (async () => json({ error: "access_denied" }, 400)) as never)).rejects.toMatchObject({
      code: "bad_response",
    });
    await expect(clientCredentialsToken("1", (async () => json({}, 503)) as never)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("reads the TenantId claim from a Fortnox token", () => {
    expect(tenantIdFromToken(jwt({ tenantId: 1234567 }))).toBe("1234567");
    expect(tenantIdFromToken(jwt({ tenantId: "88" }))).toBe("88");
    expect(tenantIdFromToken(jwt({ sub: "x" }))).toBeNull();
    expect(tenantIdFromToken("not-a-jwt")).toBeNull();
  });
});
