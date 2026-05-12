import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Email-intake end-to-end coverage.
 *
 * This spec needs:
 *   - A live Supabase project (the webhook handler hits it via the
 *     service-role client).
 *   - A pre-seeded profile row whose email_alias_hash matches
 *     INTAKE_E2E_ALIAS_HASH.
 *   - RESEND_INBOUND_WEBHOOK_SECRET set in the dev-server env so the
 *     handler verifies our test signature.
 *
 * None of those preconditions exist in CI by default, so the spec
 * skips unless explicitly enabled. Run it manually against a staging
 * environment by:
 *
 *   RUN_INTAKE_E2E=1 \
 *   INTAKE_E2E_ALIAS_HASH=<hash on the seeded profile> \
 *   RESEND_INBOUND_WEBHOOK_SECRET=<same value the server has> \
 *   PLAYWRIGHT_BASE_URL=https://app-staging.unreceipt.com \
 *   npm run test:e2e -- email-intake.spec.ts
 */

const ENABLED = process.env.RUN_INTAKE_E2E === "1";
const ALIAS_HASH = process.env.INTAKE_E2E_ALIAS_HASH ?? "";
const SECRET = process.env.RESEND_INBOUND_WEBHOOK_SECRET ?? "";

function sign(body: string, id: string, ts: string, secret: string): string {
  const stripped = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(stripped, "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return `v1,${sig}`;
}

function buildPayload(rawEml: string, aliasHash: string) {
  return JSON.stringify({
    type: "email.received",
    data: {
      from: { address: "receipts@uber.com" },
      to: [{ address: `receipts+${aliasHash}@in.unreceipt.com` }],
      subject: "Your Tuesday morning trip with Uber",
      text: "Total: EUR 12.40",
      html: null,
      headers: { "Message-Id": "<fixture-uber-step-6@uber.com>" },
      raw: Buffer.from(rawEml, "utf-8").toString("base64"),
    },
  });
}

test.describe("email intake webhook", () => {
  test.skip(
    !ENABLED || !ALIAS_HASH || !SECRET,
    "needs RUN_INTAKE_E2E + INTAKE_E2E_ALIAS_HASH + RESEND_INBOUND_WEBHOOK_SECRET against a staging env"
  );

  test("a forwarded Uber receipt lands as a digital_receipts row", async ({
    request,
  }) => {
    const rawEml = readFileSync(
      join(__dirname, "fixtures", "uber-receipt.eml"),
      "utf-8"
    );
    const body = buildPayload(rawEml, ALIAS_HASH);
    const id = "evt_e2e_uber_01";
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = sign(body, id, ts, SECRET);

    const res = await request.post("/api/intake/email", {
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": signature,
      },
      data: body,
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.id).toBe("string");

    // Idempotency: re-post the same payload, expect duplicate flag.
    const res2 = await request.post("/api/intake/email", {
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": signature,
      },
      data: body,
    });
    expect(res2.status()).toBe(200);
    const json2 = await res2.json();
    expect(json2.duplicate).toBe(true);
    expect(json2.id).toBe(json.id);
  });

  test("an unsigned POST is rejected with 401", async ({ request }) => {
    const res = await request.post("/api/intake/email", {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ type: "email.received", data: {} }),
    });
    expect(res.status()).toBe(401);
  });
});
