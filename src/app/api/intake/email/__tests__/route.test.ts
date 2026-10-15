// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signForTesting } from "@/lib/webhook-signature";

const TEST_SECRET =
  "whsec_" +
  Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const VALID_HASH = "abc12345mn";

const mocks = vi.hoisted(() => ({
  findUserByAliasHash: vi.fn(),
  parseAliasFromTo: vi.fn(),
  parseReceipt: vi.fn(),
  receiptsLookup: vi.fn(),
  receiptsInsert: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  fetchReceivedEmail: vi.fn(),
}));

const usageMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/usage", () => ({ recordReceiptUsage: usageMock }));

const rateLimitMock = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> => ({ ok: true }))
);
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: rateLimitMock,
}));

vi.mock("@/lib/resend-inbound", () => ({
  fetchReceivedEmail: mocks.fetchReceivedEmail,
}));

vi.mock("@/lib/email-alias", () => ({
  findUserByAliasHash: mocks.findUserByAliasHash,
  parseAliasFromTo: mocks.parseAliasFromTo,
}));

vi.mock("@/lib/receipts/parser", () => ({
  parseReceipt: mocks.parseReceipt,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (_table: string) => ({
      insert: (row: unknown) => ({
        select: () => ({
          single: () => mocks.receiptsInsert(row),
        }),
      }),
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (col: string, value: unknown) => {
            filters[col] = value;
            return chain;
          },
          maybeSingle: () => mocks.receiptsLookup(filters),
        };
        return chain;
      },
    }),
    storage: {
      from: () => ({
        upload: (path: string, body: Buffer | Blob, options?: unknown) =>
          mocks.storageUpload(path, body, options),
        remove: (paths: string[]) => mocks.storageRemove(paths),
      }),
    },
  }),
}));

import { POST } from "@/app/api/intake/email/route";

const NOW_SEC = 1747_000_000;

function buildRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/intake/email", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function sign(body: string, id = "msg_test_01", ts: number = NOW_SEC) {
  return {
    "svix-id": id,
    "svix-timestamp": String(ts),
    "svix-signature": signForTesting(body, id, String(ts), TEST_SECRET),
  };
}

function inboundPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "email.received",
    data: {
      from: { address: "receipts@uber.com" },
      to: [
        { address: `receipts+${VALID_HASH}@in.unreceipt.com` },
      ],
      subject: "Your Tuesday morning trip with Uber",
      text: "Total: €12.40",
      html: null,
      headers: { "Message-Id": "<msg-uber-001@uber.com>" },
      raw: Buffer.from("Raw .eml bytes here", "utf-8").toString("base64"),
      ...overrides,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_SEC * 1000));

  process.env.RESEND_INBOUND_WEBHOOK_SECRET = TEST_SECRET;
  mocks.findUserByAliasHash.mockResolvedValue({ user_id: USER_ID });
  mocks.parseAliasFromTo.mockReturnValue(VALID_HASH);
  mocks.parseReceipt.mockResolvedValue({ status: "pending_review" });
  mocks.receiptsLookup.mockResolvedValue({ data: null, error: null });
  mocks.receiptsInsert.mockResolvedValue({
    data: { id: "00000000-0000-4000-8000-000000000001" },
    error: null,
  });
  mocks.storageUpload.mockResolvedValue({ error: null });
  mocks.storageRemove.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.RESEND_INBOUND_WEBHOOK_SECRET;
});

describe("POST /api/intake/email", () => {
  it("returns 401 when no signature headers are present", async () => {
    const body = inboundPayload();
    const res = await POST(buildRequest(body));
    expect(res.status).toBe(401);
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
    expect(mocks.storageUpload).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature does not match the body", async () => {
    const body = inboundPayload();
    // Sign a DIFFERENT body, then submit the real body.
    const headers = sign("{}");
    const res = await POST(buildRequest(body, headers));
    expect(res.status).toBe(401);
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
  });

  it("returns 500 when RESEND_INBOUND_WEBHOOK_SECRET is unset (refuse to accept unverified events)", async () => {
    delete process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    const body = inboundPayload();
    const res = await POST(buildRequest(body));
    expect(res.status).toBe(500);
  });

  it("returns 404 with a generic body when the alias does not resolve", async () => {
    mocks.findUserByAliasHash.mockResolvedValue(null);
    const body = inboundPayload();
    const res = await POST(buildRequest(body, sign(body)));
    expect(res.status).toBe(404);
    const json = await res.json();
    // Must not leak that the *signature* was fine — the body looks the
    // same as a malformed-alias path.
    expect(json).toEqual({ error: "not deliverable" });
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
  });

  it("returns 404 with the same generic body when the To: cannot be parsed", async () => {
    mocks.parseAliasFromTo.mockReturnValue(null);
    const body = inboundPayload();
    const res = await POST(buildRequest(body, sign(body)));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "not deliverable" });
  });

  it("inserts a new row with intake_ref = Message-Id and uploads the raw .eml", async () => {
    const body = inboundPayload();
    const res = await POST(buildRequest(body, sign(body)));
    expect(res.status).toBe(200);

    expect(mocks.receiptsLookup).toHaveBeenCalledTimes(1);
    // Dedupe is per user, never global.
    expect(mocks.receiptsLookup).toHaveBeenCalledWith({
      user_id: USER_ID,
      intake_ref: "<msg-uber-001@uber.com>",
    });
    expect(mocks.receiptsInsert).toHaveBeenCalledTimes(1);
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1);
    expect(usageMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, source: "email" })
    );

    const [path, , uploadOptions] = mocks.storageUpload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]{36}\\.eml$`));
    expect((uploadOptions as { contentType?: string }).contentType).toBe(
      "message/rfc822"
    );
  });

  it("is idempotent on Message-Id: a duplicate POST returns 200 without inserting again", async () => {
    // First call → no existing, insert succeeds.
    const body = inboundPayload();
    const r1 = await POST(buildRequest(body, sign(body)));
    expect(r1.status).toBe(200);
    expect(mocks.receiptsInsert).toHaveBeenCalledTimes(1);

    // Second call → lookup finds the existing row, no further side effects.
    mocks.receiptsLookup.mockResolvedValueOnce({
      data: { id: "00000000-0000-4000-8000-000000000001" },
      error: null,
    });
    const r2 = await POST(buildRequest(body, sign(body)));
    expect(r2.status).toBe(200);
    const json2 = await r2.json();
    expect(json2.duplicate).toBe(true);

    // Insert + upload were NOT invoked again.
    expect(mocks.receiptsInsert).toHaveBeenCalledTimes(1);
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1);
  });

  it("still inserts (pending_review) when the parser throws", async () => {
    mocks.parseReceipt.mockRejectedValueOnce(new Error("LLM exploded"));
    const body = inboundPayload();
    const res = await POST(buildRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(mocks.receiptsInsert).toHaveBeenCalledTimes(1);

    // No canonical fields were forged when the parser failed — the row
    // is intentionally sparse so the user can complete it. source/
    // intake_ref are still present.
    const insertedRow = mocks.receiptsInsert.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(insertedRow.source).toBe("email");
    expect(insertedRow.user_id).toBe(USER_ID);
    expect(insertedRow.merchant_name).toBeUndefined();
    expect(insertedRow.total).toBeUndefined();
    expect(insertedRow.purchased_at).toBeUndefined();
  });

  it("on a parser ok result, inserts the canonical fields", async () => {
    mocks.parseReceipt.mockResolvedValueOnce({
      status: "ok",
      fields: {
        merchant_name: "Uber",
        purchased_at: "2026-05-12T08:30:00.000Z",
        total: 12.4,
        currency: "EUR",
        category: "transport",
        parse_confidence: 0.94,
      },
    });
    const body = inboundPayload();
    const res = await POST(buildRequest(body, sign(body)));
    expect(res.status).toBe(200);

    const insertedRow = mocks.receiptsInsert.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(insertedRow.merchant_name).toBe("Uber");
    expect(insertedRow.total).toBe(12.4);
    expect(insertedRow.currency).toBe("EUR");
    expect(insertedRow.parse_confidence).toBe(0.94);
    // receipt_date is the date portion of purchased_at so the legacy
    // sort + admin paste form still see the row.
    expect(insertedRow.receipt_date).toBe("2026-05-12");
  });

  it("ignores non-receive event types with a 200", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: {} });
    const res = await POST(buildRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
  });

  it("falls back to sha256 of the raw .eml when Message-Id is missing", async () => {
    const body = inboundPayload({ headers: {} });
    const res = await POST(buildRequest(body, sign(body)));
    expect(res.status).toBe(200);

    expect(mocks.receiptsInsert).toHaveBeenCalledTimes(1);
    const insertedRow = mocks.receiptsInsert.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(typeof insertedRow.intake_ref).toBe("string");
    expect((insertedRow.intake_ref as string).startsWith("sha256:")).toBe(true);
  });

  // Resend's real webhook: metadata only, body fetched by email_id.
  function metadataOnlyPayload(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      type: "email.received",
      created_at: "2026-10-14T08:00:00.000Z",
      data: {
        email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
        created_at: "2026-10-14T08:00:00.000Z",
        from: "receipts@uber.com",
        to: [`receipts+${VALID_HASH}@in.unreceipt.com`],
        cc: [],
        bcc: [],
        received_for: [],
        message_id: "<msg-uber-002@uber.com>",
        subject: "Your Tuesday morning trip with Uber",
        attachments: [],
        ...overrides,
      },
    });
  }

  it("loads the body from Resend when the webhook only carries metadata", async () => {
    mocks.fetchReceivedEmail.mockResolvedValue({
      text: "Total: 189 kr",
      html: "<p>Total: 189 kr</p>",
      headers: {},
      messageId: "<msg-uber-002@uber.com>",
      rawEml: Buffer.from("From: receipts@uber.com\r\n\r\nTotal: 189 kr"),
    });
    const body = metadataOnlyPayload();

    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(mocks.fetchReceivedEmail).toHaveBeenCalledWith(
      "56761188-7520-42d8-8898-ff6fc54ce618"
    );
    expect(mocks.parseReceipt.mock.calls[0][0].raw).toMatchObject({
      text: "Total: 189 kr",
      html: "<p>Total: 189 kr</p>",
    });
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1);
    const row = mocks.receiptsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.intake_ref).toBe("<msg-uber-002@uber.com>");
    expect(row.original_source_kind).toBe("eml");
  });

  it("answers 502 (so Resend retries) and saves nothing when the body can't be loaded", async () => {
    mocks.fetchReceivedEmail.mockResolvedValue(null);
    const body = metadataOnlyPayload();

    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(502);
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
  });

  it("finds the alias in received_for when an auto-forward kept the original To:", async () => {
    mocks.parseAliasFromTo.mockImplementation((addr: string) =>
      addr.startsWith("receipts+") ? VALID_HASH : null
    );
    mocks.fetchReceivedEmail.mockResolvedValue({
      text: "Total: 189 kr",
      html: null,
      headers: {},
      messageId: "<msg-uber-003@uber.com>",
      rawEml: null,
    });
    const body = metadataOnlyPayload({
      to: ["alex@acme.se"],
      received_for: [`receipts+${VALID_HASH}@in.unreceipt.com`],
    });

    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(mocks.findUserByAliasHash).toHaveBeenCalledWith(VALID_HASH);
    const row = mocks.receiptsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.original_source_url).toBeNull();
  });

  it("does not call Resend for an unknown alias", async () => {
    mocks.findUserByAliasHash.mockResolvedValue(null);
    const body = metadataOnlyPayload();

    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(404);
    expect(mocks.fetchReceivedEmail).not.toHaveBeenCalled();
  });
});
