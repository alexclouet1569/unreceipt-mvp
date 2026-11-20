// SERVER-ONLY. Fortnox's OAuth 2.0 for a *service account*
// (fortnox.se/developer: "Get Authorization-Code", "Get Access-Token using
// Client-Credentials", checked 2026-11-20):
//
//   1. connect: the company's system administrator approves UnReceipt on
//      Fortnox's screen (authorization code, account_type=service, PKCE S256).
//      Fortnox creates a user inside the company dedicated to UnReceipt, so
//      the connection doesn't depend on one person staying at the company.
//   2. we exchange the code once, only to read the company's TenantId and
//      check which company it is. The refresh token is never stored.
//   3. from then on: grant_type=client_credentials with the TenantId header
//      gives an access token (1 h) whenever one is needed. Nothing to rotate,
//      nothing that a lost answer can break.
//
// The integration in Fortnox's Developer Portal must have "service account"
// ("Only administrator") and PKCE turned on, the scopes below and the
// redirect URI exactly as redirectUri(). FORTNOX_CLIENT_ID / _SECRET come
// from there. The company ends the connection itself in Fortnox →
// Integrationer.

import "server-only";

import { absoluteAppUrl } from "@/lib/app-url";

export const FORTNOX_AUTH_URL = "https://apps.fortnox.se/oauth-v1/auth";
export const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
export const FORTNOX_REVOKE_URL = "https://apps.fortnox.se/oauth-v1/revoke";

// bookkeeping: vouchers, accounts, financial years. inbox: upload the
// receipt file. connectfile: attach it to the voucher. companyinformation:
// the company's name, org number and TenantId. settings: the locked period
// and the company settings.
export const FORTNOX_SCOPES = ["bookkeeping", "inbox", "connectfile", "companyinformation", "settings"] as const;

const TOKEN_TIMEOUT_MS = 15_000;

export class FortnoxOAuthError extends Error {
  constructor(
    /**
     * consent_gone: the company removed UnReceipt in Fortnox (or the grant is
     * otherwise refused): it must connect again. not_configured / unavailable
     * / bad_response / scope_missing: ours or Fortnox's problem, not the
     * company's.
     */
    readonly code: "consent_gone" | "not_configured" | "unavailable" | "bad_response" | "scope_missing",
  ) {
    super(`fortnox oauth: ${code}`);
    this.name = "FortnoxOAuthError";
  }
}

export function fortnoxConfigured(): boolean {
  return Boolean(process.env.FORTNOX_CLIENT_ID?.trim() && process.env.FORTNOX_CLIENT_SECRET?.trim());
}

function credentials(): { id: string; secret: string } {
  const id = process.env.FORTNOX_CLIENT_ID?.trim();
  const secret = process.env.FORTNOX_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new FortnoxOAuthError("not_configured");
  return { id, secret };
}

const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

export function redirectUri(): string {
  return absoluteAppUrl("/api/accounting/fortnox/callback");
}

export function authUrl(state: string, codeChallenge: string): string {
  const { id } = credentials();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    scope: FORTNOX_SCOPES.join(" "),
    state,
    access_type: "offline",
    response_type: "code",
    account_type: "service",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${FORTNOX_AUTH_URL}?${params}`;
}

export type FortnoxGrant = {
  accessToken: string;
  /** Only to revoke a grant we won't keep; never stored. */
  refreshToken: string | null;
  /** Epoch ms. */
  expiresAt: number;
  scopes: string[];
};

async function tokenRequest(
  form: Record<string, string>,
  extraHeaders: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<FortnoxGrant> {
  const { id, secret } = credentials();
  let res: Response;
  try {
    res = await fetchImpl(FORTNOX_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basic(id, secret),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...extraHeaders,
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new FortnoxOAuthError("unavailable");
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) throw new FortnoxOAuthError("unavailable");
    // Only invalid_grant means one company's consent is gone (UnReceipt
    // removed in Fortnox, the code used twice). invalid_client,
    // unauthorized_client (RFC 6749: this client may not use this grant, e.g.
    // "service account" switched off in the Developer Portal) and anything
    // else are our configuration: never a reason to disconnect every company.
    const error = typeof body?.error === "string" ? body.error : "";
    if (error === "invalid_grant") throw new FortnoxOAuthError("consent_gone");
    throw new FortnoxOAuthError("bad_response");
  }
  const accessToken = typeof body?.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body?.refresh_token === "string" && body.refresh_token ? body.refresh_token : null;
  const expiresIn = typeof body?.expires_in === "number" ? body.expires_in : Number(body?.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new FortnoxOAuthError("bad_response");
  const scopes = typeof body?.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [];
  return { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, scopes };
}

/** The one code exchange of a connect flow (with the PKCE verifier). */
export async function exchangeCode(code: string, codeVerifier: string, fetchImpl: typeof fetch = fetch): Promise<FortnoxGrant> {
  const grant = await tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: codeVerifier },
    {},
    fetchImpl,
  );
  // A permission unticked on the consent screen: we couldn't post.
  if (grant.scopes.length > 0 && !FORTNOX_SCOPES.every((s) => grant.scopes.includes(s))) {
    throw new FortnoxOAuthError("scope_missing");
  }
  return grant;
}

/** An access token for a connected company: client credentials + its TenantId. */
export async function clientCredentialsToken(tenantId: string, fetchImpl: typeof fetch = fetch): Promise<FortnoxGrant> {
  if (!/^[0-9]{1,20}$/.test(tenantId)) throw new FortnoxOAuthError("bad_response");
  return tokenRequest({ grant_type: "client_credentials", scope: FORTNOX_SCOPES.join(" ") }, { TenantId: tenantId }, fetchImpl);
}

/**
 * The TenantId inside a Fortnox access token (a JWT with a tenantId claim,
 * fortnox.se/developer). The token comes straight from Fortnox's token
 * endpoint over TLS, so reading the claim without verifying the signature
 * only saves a request; callers fall back to the API when it is missing.
 */
export function tenantIdFromToken(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const raw = payload.tenantId ?? payload.tenant_id ?? payload.TenantId;
    const id = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "";
    return /^[0-9]{1,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Best effort: gives back a grant we won't keep (a refused connect). */
export async function revokeRefreshToken(refreshToken: string | null, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!refreshToken) return false;
  let id: string;
  let secret: string;
  try {
    ({ id, secret } = credentials());
  } catch {
    return false;
  }
  try {
    const res = await fetchImpl(FORTNOX_REVOKE_URL, {
      method: "POST",
      headers: { Authorization: basic(id, secret), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
