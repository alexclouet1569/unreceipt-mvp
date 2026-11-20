// SERVER-ONLY. Fortnox's OAuth 2.0 (authorization code, confidential
// client): the consent URL, the code exchange, the refresh and the revoke.
//
// * Access tokens live 1 hour; refresh tokens 45 days and are ROTATED on
//   every refresh: the old one stops working once a new one is issued.
//   tokens.ts refreshes only under a database lock for that reason.
// * The person who approves on Fortnox's screen must be a system
//   administrator of that Fortnox company.
// * FORTNOX_CLIENT_ID / FORTNOX_CLIENT_SECRET come from the integration in
//   Fortnox's Developer Portal; the redirect URI registered there must be
//   exactly redirectUri() below.

import "server-only";

import { absoluteAppUrl } from "@/lib/app-url";

export const FORTNOX_AUTH_URL = "https://apps.fortnox.se/oauth-v1/auth";
export const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
export const FORTNOX_REVOKE_URL = "https://apps.fortnox.se/oauth-v1/revoke";

// bookkeeping: vouchers, accounts, financial years. inbox: upload the
// receipt file. connectfile: attach it to the voucher. companyinformation:
// the company's name and org number, shown before anything is posted.
// settings: the locked period.
export const FORTNOX_SCOPES = ["bookkeeping", "inbox", "connectfile", "companyinformation", "settings"] as const;

const TOKEN_TIMEOUT_MS = 15_000;

export class FortnoxOAuthError extends Error {
  constructor(
    /** invalid_grant: the refresh token is dead, the company must reconnect. */
    readonly code: "invalid_grant" | "not_configured" | "unavailable" | "bad_response" | "scope_missing",
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

export function redirectUri(): string {
  return absoluteAppUrl("/api/accounting/fortnox/callback");
}

export function authUrl(state: string): string {
  const { id } = credentials();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    scope: FORTNOX_SCOPES.join(" "),
    state,
    access_type: "offline",
    response_type: "code",
  });
  return `${FORTNOX_AUTH_URL}?${params}`;
}

export type FortnoxTokens = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scopes: string[];
};

async function tokenRequest(form: Record<string, string>, fetchImpl: typeof fetch): Promise<FortnoxTokens> {
  const { id, secret } = credentials();
  let res: Response;
  try {
    res = await fetchImpl(FORTNOX_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
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
    if (res.status >= 500) throw new FortnoxOAuthError("unavailable");
    // invalid_grant: expired, revoked, already rotated or a used code.
    if (body?.error === "invalid_grant" || res.status === 400 || res.status === 401) {
      throw new FortnoxOAuthError("invalid_grant");
    }
    throw new FortnoxOAuthError("bad_response");
  }
  const accessToken = typeof body?.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token : "";
  const expiresIn = typeof body?.expires_in === "number" ? body.expires_in : Number(body?.expires_in);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new FortnoxOAuthError("bad_response");
  }
  const scopes = typeof body?.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [];
  return { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, scopes };
}

export async function exchangeCode(code: string, fetchImpl: typeof fetch = fetch): Promise<FortnoxTokens> {
  const tokens = await tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri() },
    fetchImpl,
  );
  // A permission unticked on the consent screen: we couldn't post.
  if (tokens.scopes.length > 0 && !FORTNOX_SCOPES.every((s) => tokens.scopes.includes(s))) {
    throw new FortnoxOAuthError("scope_missing");
  }
  return tokens;
}

export async function refreshTokens(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<FortnoxTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

/** Best effort: true when Fortnox confirmed the revoke. */
export async function revokeRefreshToken(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
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
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
