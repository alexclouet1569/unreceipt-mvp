import { describe, expect, it } from "vitest";
import {
  signForTesting,
  verifyWebhookSignature,
} from "@/lib/webhook-signature";

// `whsec_` + base64 of a 32-byte secret. Real Resend/Svix secrets follow
// the same shape.
const SECRET =
  "whsec_" +
  Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

const NOW_SEC = 1747_000_000;
const ID = "msg_test_01";

function freshSig(body: string, ts: number = NOW_SEC) {
  return signForTesting(body, ID, String(ts), SECRET);
}

describe("verifyWebhookSignature", () => {
  it("returns ok for a fresh, well-formed signature", () => {
    const body = JSON.stringify({ type: "email.received" });
    const result = verifyWebhookSignature({
      body,
      id: ID,
      timestamp: String(NOW_SEC),
      signature: freshSig(body),
      secret: SECRET,
      now: () => NOW_SEC * 1000,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing headers", () => {
    const result = verifyWebhookSignature({
      body: "{}",
      id: null,
      timestamp: String(NOW_SEC),
      signature: "v1,xxxx",
      secret: SECRET,
      now: () => NOW_SEC * 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_headers");
  });

  it("rejects a tampered body", () => {
    const sig = freshSig("{}");
    const result = verifyWebhookSignature({
      body: "{tampered}",
      id: ID,
      timestamp: String(NOW_SEC),
      signature: sig,
      secret: SECRET,
      now: () => NOW_SEC * 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects a stale timestamp outside the tolerance window", () => {
    const body = "{}";
    const tenMinutesAgo = NOW_SEC - 10 * 60;
    const result = verifyWebhookSignature({
      body,
      id: ID,
      timestamp: String(tenMinutesAgo),
      signature: signForTesting(body, ID, String(tenMinutesAgo), SECRET),
      secret: SECRET,
      now: () => NOW_SEC * 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("stale_timestamp");
  });

  it("accepts when multiple signatures are present and one matches", () => {
    const body = JSON.stringify({ hi: 1 });
    const good = freshSig(body);
    const decoy = "v1,deadbeef";
    const result = verifyWebhookSignature({
      body,
      id: ID,
      timestamp: String(NOW_SEC),
      signature: `${decoy} ${good}`,
      secret: SECRET,
      now: () => NOW_SEC * 1000,
    });
    expect(result.ok).toBe(true);
  });

  it("ignores non-v1 signature versions", () => {
    const body = "{}";
    const sig = freshSig(body);
    // Replace the v1 prefix with v2 — should no longer match.
    const v2 = sig.replace(/^v1,/, "v2,");
    const result = verifyWebhookSignature({
      body,
      id: ID,
      timestamp: String(NOW_SEC),
      signature: v2,
      secret: SECRET,
      now: () => NOW_SEC * 1000,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed secret as misconfigured", () => {
    const result = verifyWebhookSignature({
      body: "{}",
      id: ID,
      timestamp: String(NOW_SEC),
      signature: "v1,xxxx",
      secret: "",
      now: () => NOW_SEC * 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("misconfigured");
  });
});
