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
  upsert: vi.fn(),
  findReceiptAttachment: vi.fn(),
  extractReceipt: vi.fn(),
  parseAttachmentExtraction: vi.fn(),
}));

vi.mock("@/lib/receipts/email-attachments", () => ({
  findReceiptAttachment: mocks.findReceiptAttachment,
}));
vi.mock("@/lib/ocr", () => ({ extractReceipt: mocks.extractReceipt }));
const productAccessMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/subscription-gate", () => ({ hasProductAccess: productAccessMock }));

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
  buildForwardingAddress: (hash: string) => `receipts+${hash}@in.unreceipt.com`,
}));

const ownerAddressesMock = vi.hoisted(() =>
  vi.fn(async (_userId: string, alias: string) => ({ personal: ["anna@gmail.com"], alias })),
);
vi.mock("@/lib/owner-addresses", () => ({ loadOwnerAddresses: ownerAddressesMock }));

vi.mock("@/lib/receipts/parser", () => ({
  parseReceipt: mocks.parseReceipt,
  parseAttachmentExtraction: mocks.parseAttachmentExtraction,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      upsert: (row: unknown, options?: unknown) => mocks.upsert(table, row, options),
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
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.findReceiptAttachment.mockResolvedValue(null);
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
    // Lands as pending_review (parser can't vouch for it): anyone can
    // email an alias, so it only counts once the user confirms it.
    expect(usageMock).not.toHaveBeenCalled();

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
    // A verified email receipt counts toward the plan right away.
    expect(usageMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, source: "email" })
    );
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

  function gmailConfirmation(dmarc: string | null) {
    mocks.fetchReceivedEmail.mockResolvedValue({
      text: "anna@gmail.com has requested to automatically forward mail …",
      html: null,
      headers: {},
      messageId: "<confirm-1@google.com>",
      rawEml: null,
      authentication: dmarc ? { spf: "pass", dkim: dmarc, dmarc } : null,
    });
    return metadataOnlyPayload({
      from: "Gmail Team <forwarding-noreply@google.com>",
      subject: "(#593872831) Gmail Forwarding Confirmation - Receive Mail from anna@gmail.com",
    });
  }

  it("keeps Gmail's forwarding confirmation code instead of filing a receipt", async () => {
    const body = gmailConfirmation("pass");

    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, forwardingConfirmation: true });
    expect(mocks.upsert).toHaveBeenCalledWith(
      "email_forwarding_confirmations",
      expect.objectContaining({
        user_id: USER_ID,
        provider: "gmail",
        code: "593872831",
        for_address: "anna@gmail.com",
      }),
      { onConflict: "user_id" },
    );
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
    expect(usageMock).not.toHaveBeenCalled();
  });

  it("files a forged Gmail confirmation (DMARC fail) as an ordinary email", async () => {
    const body = gmailConfirmation("fail");

    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.parseReceipt.mock.calls[0][0].raw.authenticated).toBe(false);
    expect(mocks.receiptsInsert).toHaveBeenCalledTimes(1);
  });

  it("answers 500 (so Resend retries) when the confirmation code can't be saved", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "boom" } });
    const body = gmailConfirmation("pass");

    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(500);
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
  });

  it("tells the parser the sender is authenticated only on Resend's DMARC pass", async () => {
    mocks.fetchReceivedEmail.mockResolvedValue({
      text: "Total: 189 kr",
      html: null,
      headers: {},
      messageId: "<msg-uber-009@uber.com>",
      rawEml: null,
      authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
    });
    const body = metadataOnlyPayload({ subject: "Bad\u0000subject " + "x".repeat(5000) });

    const res = await POST(buildRequest(body, sign(body)));

    expect(res.status).toBe(200);
    const raw = mocks.parseReceipt.mock.calls[0][0].raw;
    expect(raw.authenticated).toBe(true);
    expect(raw.subject).not.toContain("\u0000");
    const row = mocks.receiptsInsert.mock.calls[0][0] as { notes: string };
    expect(row.notes.length).toBeLessThanOrEqual(310);
  });

  describe("receipt ownership", () => {
    function uberEmail(rawHeaders: string) {
      mocks.fetchReceivedEmail.mockResolvedValue({
        text: "Total: 189 SEK",
        html: null,
        headers: {},
        messageId: `<own-${rawHeaders.length}@uber.com>`,
        rawEml: Buffer.from(`From: noreply@uber.com\r\n${rawHeaders}Subject: Your trip\r\n\r\nTotal: 189 SEK`),
        authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
      });
      // The webhook's own recipient list names the alias; it must not count.
      return metadataOnlyPayload({
        to: [`receipts+${VALID_HASH}@in.unreceipt.com`],
        received_for: [`receipts+${VALID_HASH}@in.unreceipt.com`],
      });
    }
    const recipientSeen = () => mocks.parseReceipt.mock.calls[0][0].raw.recipient;

    it("reads the To: header of the message itself", async () => {
      const body = uberEmail("To: Anna <anna@gmail.com>\r\n");
      await POST(buildRequest(body, sign(body)));
      expect(ownerAddressesMock).toHaveBeenCalledWith(USER_ID, `receipts+${VALID_HASH}@in.unreceipt.com`);
      expect(recipientSeen()).toBe("personal");
    });

    it("doesn't take someone else's receipt for the user's, whatever the webhook says", async () => {
      const body = uberEmail("To: bjorn@gmail.com\r\n");
      await POST(buildRequest(body, sign(body)));
      expect(recipientSeen()).toBe("none");
    });

    it("refuses a slipped-in second To: or a Cc: naming the alias", async () => {
      const twice = uberEmail(`To: receipts+${VALID_HASH}@in.unreceipt.com\r\nTo: bjorn@gmail.com\r\n`);
      await POST(buildRequest(twice, sign(twice)));
      expect(recipientSeen()).toBe("none");
      mocks.parseReceipt.mockClear();
      const cc = uberEmail(`To: bjorn@gmail.com\r\nCc: receipts+${VALID_HASH}@in.unreceipt.com\r\n`);
      await POST(buildRequest(cc, sign(cc)));
      expect(recipientSeen()).toBe("none");
    });

    it("recognises a receipt sent straight to the alias", async () => {
      const body = uberEmail(`To: receipts+${VALID_HASH}@in.unreceipt.com\r\n`);
      await POST(buildRequest(body, sign(body)));
      expect(recipientSeen()).toBe("alias");
    });
  });

  describe("receipt attached as a PDF or photo", () => {
    const PDF = {
      mediaType: "application/pdf",
      extension: "pdf",
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
    };
    const ATTACHMENT_FIELDS = {
      merchant_name: "Scandic Hotel",
      purchased_at: "2026-10-01T12:00:00.000Z",
      total: 1250,
      currency: "SEK",
      subtotal: null,
      tax_amount: 133.93,
      tax_rate: 12,
      category: "accommodation",
      payment_method: null,
      card_last_four: null,
      notes: null,
      items: null,
      parse_confidence: 0.7,
    };

    it("reads the attachment when the body has no receipt, keeps it as the image, and leaves it for review", async () => {
      mocks.findReceiptAttachment.mockResolvedValue(PDF);
      mocks.extractReceipt.mockResolvedValue({ merchant: "Scandic Hotel" });
      mocks.parseAttachmentExtraction.mockReturnValue({ status: "ok", fields: ATTACHMENT_FIELDS });

      const body = inboundPayload();
      const res = await POST(buildRequest(body, sign(body)));
      expect(res.status).toBe(200);

      expect(mocks.extractReceipt).toHaveBeenCalledWith(
        Buffer.from(PDF.bytes).toString("base64"),
        "application/pdf",
      );
      expect(rateLimitMock).toHaveBeenCalledWith("intakeAttachment", VALID_HASH);
      const row = mocks.receiptsInsert.mock.calls[0][0];
      expect(row.merchant_name).toBe("Scandic Hotel");
      expect(row.total).toBe(1250);
      expect(row.status).toBe("pending_review");
      expect(row.image_url).toBe(`${USER_ID}/${row.id}.pdf`);
      const attachmentUpload = mocks.storageUpload.mock.calls.find(([path]) => path === row.image_url);
      expect(attachmentUpload?.[2]).toMatchObject({ contentType: "application/pdf" });
      // Not billed until the user confirms it.
      expect(usageMock).not.toHaveBeenCalled();
    });

    it("doesn't look at attachments when the body already gave a receipt", async () => {
      mocks.parseReceipt.mockResolvedValue({ status: "ok", fields: ATTACHMENT_FIELDS });
      const body = inboundPayload();
      await POST(buildRequest(body, sign(body)));
      expect(mocks.findReceiptAttachment).not.toHaveBeenCalled();
      expect(mocks.extractReceipt).not.toHaveBeenCalled();
      expect(mocks.receiptsInsert.mock.calls[0][0].image_url).toBeNull();
    });

    it("keeps the file but skips the read when the alias is over its attachment limit", async () => {
      mocks.findReceiptAttachment.mockResolvedValue(PDF);
      rateLimitMock.mockImplementation(async (name?: unknown) =>
        name === "intakeAttachment" ? { ok: false, retryAfterSeconds: 60 } : { ok: true },
      );
      const body = inboundPayload();
      const res = await POST(buildRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(mocks.extractReceipt).not.toHaveBeenCalled();
      const row = mocks.receiptsInsert.mock.calls[0][0];
      expect(row.status).toBe("pending_review");
      expect(row.image_url).toMatch(/\.pdf$/);
      rateLimitMock.mockImplementation(async () => ({ ok: true }));
    });

    it("keeps the file but doesn't read it for an account without product access", async () => {
      mocks.findReceiptAttachment.mockResolvedValue(PDF);
      productAccessMock.mockResolvedValueOnce(false);
      const body = inboundPayload();
      const res = await POST(buildRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(mocks.extractReceipt).not.toHaveBeenCalled();
      expect(mocks.receiptsInsert.mock.calls[0][0].image_url).toMatch(/\.pdf$/);
    });

    it("still saves the email for review when the attachment read fails", async () => {
      mocks.findReceiptAttachment.mockResolvedValue(PDF);
      mocks.extractReceipt.mockRejectedValue(new Error("vision down"));
      const body = inboundPayload();
      const res = await POST(buildRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(mocks.parseAttachmentExtraction).not.toHaveBeenCalled();
      expect(mocks.receiptsInsert.mock.calls[0][0].status).toBe("pending_review");
    });

    it("removes the stored attachment when the insert fails", async () => {
      mocks.findReceiptAttachment.mockResolvedValue(PDF);
      mocks.extractReceipt.mockResolvedValue({});
      mocks.parseAttachmentExtraction.mockReturnValue({ status: "pending_review" });
      mocks.receiptsInsert.mockResolvedValue({ data: null, error: { code: "XX000" } });
      const body = inboundPayload();
      const res = await POST(buildRequest(body, sign(body)));
      expect(res.status).toBe(500);
      const removed = mocks.storageRemove.mock.calls.flatMap(([paths]) => paths);
      expect(removed.some((p: string) => p.endsWith(".pdf"))).toBe(true);
      expect(removed.some((p: string) => p.endsWith(".eml"))).toBe(true);
    });
  });
});
