// @vitest-environment node
// Pub/Sub's push token, signed with a test RSA key: good, wrong audience,
// wrong account, unverified, expired, wrong issuer, missing, forged.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK, type CryptoKey } from "jose";
import { GOOGLE_JWKS_URL, verifyPubSubPush } from "../pubsub-auth";

const AUD = "https://app.unreceipt.com/api/mailboxes/push/google";
const SA = "gmail-push@unreceipt-prod.iam.gserviceaccount.com";

let privateKey: CryptoKey;
let jwk: JWK;
let otherKey: CryptoKey;

async function token(claims: Record<string, unknown> = {}, { key, exp }: { key?: CryptoKey; exp?: string | number } = {}) {
  return new SignJWT({ email: SA, email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-kid", typ: "JWT" })
    .setIssuer((claims.iss as string) ?? "https://accounts.google.com")
    .setAudience((claims.aud as string) ?? AUD)
    .setSubject("1234567890")
    .setIssuedAt()
    .setExpirationTime(exp ?? "1h")
    .sign(key ?? privateKey);
}

const keys = () => createLocalJWKSet({ keys: [jwk] });

beforeEach(async () => {
  process.env.GOOGLE_PUBSUB_PUSH_AUDIENCE = AUD;
  process.env.GOOGLE_PUBSUB_SA_EMAIL = SA;
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-kid", alg: "RS256", use: "sig" };
  otherKey = (await generateKeyPair("RS256")).privateKey;
});

afterEach(() => vi.unstubAllGlobals());

describe("verifyPubSubPush", () => {
  it("accepts our subscription's token (both issuer spellings)", async () => {
    expect(await verifyPubSubPush(`Bearer ${await token()}`, { keys: keys() })).toEqual({ ok: true });
    expect(await verifyPubSubPush(`Bearer ${await token({ iss: "accounts.google.com" })}`, { keys: keys() })).toEqual({
      ok: true,
    });
  });

  it("refuses another audience (403), another or unverified account (403)", async () => {
    expect(await verifyPubSubPush(`Bearer ${await token({ aud: "https://evil.example" })}`, { keys: keys() })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(
      await verifyPubSubPush(`Bearer ${await token({ email: "someone@evil.iam.gserviceaccount.com" })}`, { keys: keys() }),
    ).toMatchObject({ ok: false, status: 403, reason: "wrong_account" });
    expect(await verifyPubSubPush(`Bearer ${await token({ email_verified: false })}`, { keys: keys() })).toMatchObject({
      ok: false,
      status: 403,
    });
    // No email claim at all (undefined is left out of the JSON).
    expect(await verifyPubSubPush(`Bearer ${await token({ email: undefined })}`, { keys: keys() })).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("refuses an expired token, another issuer, a forged signature and garbage (401)", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(await verifyPubSubPush(`Bearer ${await token({}, { exp: past })}`, { keys: keys() })).toMatchObject({
      ok: false,
      status: 401,
      reason: "expired",
    });
    expect(await verifyPubSubPush(`Bearer ${await token({ iss: "https://evil.example" })}`, { keys: keys() })).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(await verifyPubSubPush(`Bearer ${await token({}, { key: otherKey })}`, { keys: keys() })).toMatchObject({
      ok: false,
      status: 401,
    });
    for (const header of [null, "", "Bearer", "Basic abc", "Bearer not.a.jwt!"]) {
      expect(await verifyPubSubPush(header, { keys: keys() })).toMatchObject({ ok: false, status: 401 });
    }
  });

  it("refuses everything while unconfigured (503)", async () => {
    delete process.env.GOOGLE_PUBSUB_SA_EMAIL;
    expect(await verifyPubSubPush(`Bearer ${await token()}`, { keys: keys() })).toMatchObject({ ok: false, status: 503 });
  });

  it("fetches Google's published keys by default", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyPubSubPush(`Bearer ${await token()}`)).toEqual({ ok: true });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(GOOGLE_JWKS_URL);
  });
});
