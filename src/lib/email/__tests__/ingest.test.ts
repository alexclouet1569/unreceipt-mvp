// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ALIAS = "receipts+abc12345mn@in.unreceipt.com";

const mocks = vi.hoisted(() => ({
  parseReceipt: vi.fn(),
  receiptsLookup: vi.fn(),
  receiptsInsert: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  ocr: vi.fn(),
  usage: vi.fn(async () => {}),
  org: vi.fn(async () => "org-1"),
  home: vi.fn(async () => "SEK"),
  owner: vi.fn(async (_userId: string, alias: string) => ({ personal: ["anna@gmail.com"], alias })),
}));

vi.mock("@/lib/usage", () => ({ recordReceiptUsage: mocks.usage }));
vi.mock("@/lib/organizations", () => ({ getOrCreateDefaultOrganization: mocks.org }));
vi.mock("@/lib/owner-addresses", () => ({ loadOwnerAddresses: mocks.owner }));
vi.mock("@/lib/receipts/parser", () => ({ parseReceipt: mocks.parseReceipt }));
vi.mock("@/lib/ocr", () => ({ extractReceipt: mocks.ocr, CLAUDE_CALL_BUDGET_MS: 25_000 }));
vi.mock("@/lib/fx", () => ({ homeCurrencyOf: mocks.home }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (row: unknown) => ({ select: () => ({ single: () => mocks.receiptsInsert(row) }) }),
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
        upload: (path: string, body: Buffer, options?: unknown) => mocks.storageUpload(path, body, options),
        remove: (paths: string[]) => mocks.storageRemove(paths),
      }),
    },
  }),
}));

import { ingestReceiptEmail, type IngestInput } from "@/lib/email/ingest";

const RAW = Buffer.from("From: receipts@uber.com\r\nTo: anna@gmail.com\r\nSubject: Trip\r\n\r\nTotal: 189 SEK");

function input(overrides: Partial<IngestInput> = {}): IngestInput {
  return {
    userId: USER_ID,
    source: "forwarding",
    rawEml: RAW,
    text: "Total: 189 SEK",
    html: null,
    subject: "Your trip",
    from: "receipts@uber.com",
    to: "anna@gmail.com",
    messageId: "<trip-1@uber.com>",
    trust: { dmarc: "pass", recipient: { from: "to-header", aliasAddress: ALIAS } },
    ...overrides,
  };
}

const UBER_OK = {
  status: "ok",
  fields: {
    merchant_name: "Uber",
    purchased_at: "2026-11-02T08:30:00.000Z",
    total: 189,
    currency: "SEK",
    category: "transport",
    parse_confidence: 0.95,
  },
};

// A real one-page PDF (the page cap parses it), padded past the
// attachment size floor with a long title.
let PDF = Buffer.alloc(0);
beforeAll(async () => {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  doc.setTitle("x".repeat(9000));
  PDF = Buffer.from(await doc.save({ useObjectStreams: false }));
});
const emlWithPdf = () =>
  Buffer.from(
    [
      "From: kvitto@ica.se",
      "To: anna@gmail.com",
      "Subject: Kvitto",
      'Content-Type: multipart/mixed; boundary="B1"',
      "",
      "--B1",
      "Content-Type: text/plain",
      "",
      "Ditt kvitto bifogas.",
      "--B1",
      "Content-Type: application/pdf; name=kvitto.pdf",
      "Content-Transfer-Encoding: base64",
      "Content-Disposition: attachment; filename=kvitto.pdf",
      "",
      PDF.toString("base64"),
      "--B1--",
    ].join("\r\n"),
    "latin1"
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.parseReceipt.mockResolvedValue({ status: "pending_review" });
  mocks.receiptsLookup.mockResolvedValue({ data: null, error: null });
  mocks.receiptsInsert.mockResolvedValue({ data: { id: "receipt-1" }, error: null });
  mocks.storageUpload.mockResolvedValue({ error: null });
  mocks.storageRemove.mockResolvedValue({ error: null });
  mocks.ocr.mockReset();
  mocks.home.mockResolvedValue("SEK");
});

describe("ingestReceiptEmail", () => {
  it("creates a receipt with the message as its original and counts a verified one", async () => {
    mocks.parseReceipt.mockResolvedValueOnce(UBER_OK);

    const result = await ingestReceiptEmail(input());

    expect(result).toEqual({ kind: "created", receiptId: "receipt-1", status: "verified" });
    expect(mocks.receiptsLookup).toHaveBeenCalledWith({ user_id: USER_ID, intake_ref: "<trip-1@uber.com>" });
    // The raw message's own To: names one of the user's inboxes.
    expect(mocks.owner).toHaveBeenCalledWith(USER_ID, ALIAS);
    expect(mocks.parseReceipt.mock.calls[0][0].raw).toMatchObject({
      authenticated: true,
      recipient: "personal",
      templatesOnly: false,
    });
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1);
    const [path, bytes, options] = mocks.storageUpload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]{36}\\.eml$`));
    expect(bytes).toBe(RAW);
    expect(options).toMatchObject({ contentType: "message/rfc822", upsert: false });
    const row = mocks.receiptsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      user_id: USER_ID,
      organization_id: "org-1",
      // receipts_source_check allows only 'email' for any email channel.
      source: "email",
      intake_channel: "forwarding",
      intake_ref: "<trip-1@uber.com>",
      merchant_name: "Uber",
      receipt_date: "2026-11-02",
      original_source_url: path,
      original_source_kind: "eml",
      status: "verified",
    });
    expect(row.id).toBe((path as string).slice(USER_ID.length + 1, -4));
    expect(mocks.usage).toHaveBeenCalledWith({ userId: USER_ID, receiptId: "receipt-1", source: "email" });
  });

  it("keeps a mailbox receipt for the owner to confirm, whatever was read, and records the channel", async () => {
    // Even a template the parser trusted: a mailbox receipt is the owner's
    // alone until they confirm it (the firm doesn't see it before).
    mocks.parseReceipt.mockResolvedValueOnce(UBER_OK);

    const result = await ingestReceiptEmail(input({ source: "mailbox" }));

    expect(result).toEqual({ kind: "created", receiptId: "receipt-1", status: "pending_review" });
    const row = mocks.receiptsInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ source: "email", intake_channel: "mailbox", status: "pending_review" });
    // Counted toward the plan only once confirmed.
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("returns the existing row for a message already filed, with no side effects", async () => {
    mocks.receiptsLookup.mockResolvedValueOnce({ data: { id: "earlier" }, error: null });

    const result = await ingestReceiptEmail(input());

    expect(result).toEqual({ kind: "duplicate", receiptId: "earlier" });
    expect(mocks.parseReceipt).not.toHaveBeenCalled();
    expect(mocks.storageUpload).not.toHaveBeenCalled();
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("asks for a redelivery when the duplicate lookup fails", async () => {
    mocks.receiptsLookup.mockResolvedValueOnce({ data: null, error: { code: "57014" } });
    expect(await ingestReceiptEmail(input())).toEqual({ kind: "retry", reason: "lookup_failed" });
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
  });

  it("derives intake_ref from the headers, then the raw message, then the fallback identity", async () => {
    await ingestReceiptEmail(input({ messageId: null, headers: { "message-id": " <h-1@x> " } }));
    expect(mocks.receiptsLookup.mock.calls[0][0]).toMatchObject({ intake_ref: "<h-1@x>" });

    await ingestReceiptEmail(input({ messageId: null }));
    const rawRef = `sha256:${createHash("sha256").update(RAW).digest("hex")}`;
    expect(mocks.receiptsLookup.mock.calls[1][0]).toMatchObject({ intake_ref: rawRef });

    const identity = { emailId: "e-1", toAddr: ALIAS };
    await ingestReceiptEmail(input({ messageId: null, rawEml: null, fallbackIdentity: identity }));
    const idRef = `sha256:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
    expect(mocks.receiptsLookup.mock.calls[2][0]).toMatchObject({ intake_ref: idRef });
  });

  it("stores an attachment OCR read as the original, with the message beside it", async () => {
    mocks.ocr.mockResolvedValue({
      merchant: "ICA Maxi",
      amount: 181,
      currency: "SEK",
      receipt_date: "2026-11-02",
      confidence: 0.97,
    });
    const raw = emlWithPdf();

    const result = await ingestReceiptEmail(input({ rawEml: raw, messageId: "<pdf-1@ica.se>" }));

    expect(result).toMatchObject({ kind: "created", status: "pending_review" });
    expect(mocks.parseReceipt.mock.calls[0][0].raw).toMatchObject({ templatesOnly: true });
    expect(mocks.ocr.mock.calls[0][1]).toBe("application/pdf");
    expect(mocks.storageUpload).toHaveBeenCalledTimes(2);
    const [pdfPath, pdfBytes, pdfOptions] = mocks.storageUpload.mock.calls[0];
    expect(pdfPath).toMatch(/\.pdf$/);
    expect((pdfBytes as Buffer).equals(PDF)).toBe(true);
    expect(pdfOptions).toMatchObject({ contentType: "application/pdf" });
    const [emlPath, emlBytes] = mocks.storageUpload.mock.calls[1];
    expect(emlPath).toBe((pdfPath as string).replace(/\.pdf$/, ".eml"));
    expect(emlBytes).toBe(raw);
    expect(mocks.receiptsInsert.mock.calls[0][0]).toMatchObject({
      merchant_name: "ICA Maxi",
      total: 181,
      original_source_url: pdfPath,
      original_source_kind: "application/pdf",
      status: "pending_review",
    });
    // An untrusted extraction counts only once the user confirms it.
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("asks for a redelivery, removing what it stored, when a file can't be stored", async () => {
    mocks.ocr.mockResolvedValue({ merchant: "ICA Maxi", amount: 181, currency: "SEK", receipt_date: "2026-11-02" });
    mocks.storageUpload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "down" } });

    const result = await ingestReceiptEmail(input({ rawEml: emlWithPdf() }));

    expect(result).toEqual({ kind: "retry", reason: "upload_failed" });
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
    expect(mocks.storageRemove).toHaveBeenCalledWith([mocks.storageUpload.mock.calls[0][0]]);
  });

  it("asks for a redelivery when the original itself can't be stored", async () => {
    mocks.storageUpload.mockResolvedValueOnce({ error: { message: "down" } });
    expect(await ingestReceiptEmail(input())).toEqual({ kind: "retry", reason: "upload_failed" });
    expect(mocks.receiptsInsert).not.toHaveBeenCalled();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });

  it("returns the winner and removes its own files when a concurrent delivery won the insert", async () => {
    mocks.receiptsInsert.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    mocks.receiptsLookup
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "winner" }, error: null });

    const result = await ingestReceiptEmail(input());

    expect(result).toEqual({ kind: "duplicate", receiptId: "winner" });
    expect(mocks.storageRemove).toHaveBeenCalledWith([mocks.storageUpload.mock.calls[0][0]]);
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("asks for a redelivery, removing its files, when the insert fails", async () => {
    mocks.receiptsInsert.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    expect(await ingestReceiptEmail(input())).toEqual({ kind: "retry", reason: "insert_failed" });
    expect(mocks.storageRemove).toHaveBeenCalledTimes(1);
  });

  it("gives an unread email the company's own currency, not the column's EUR default", async () => {
    mocks.home.mockResolvedValue("EUR");

    await ingestReceiptEmail(input({ organizationId: "org-fr" }));

    // A given company is used as is.
    expect(mocks.org).not.toHaveBeenCalled();
    expect(mocks.home).toHaveBeenCalledWith("org-fr");
    expect(mocks.receiptsInsert.mock.calls[0][0]).toMatchObject({
      organization_id: "org-fr",
      currency: "EUR",
      status: "pending_review",
    });
  });

  it("trusts nothing without a DMARC pass, and takes a channel's own recipient verdict", async () => {
    await ingestReceiptEmail(input({ trust: { dmarc: "fail", recipient: { from: "given", ownership: "personal" } } }));
    expect(mocks.parseReceipt.mock.calls[0][0].raw).toMatchObject({ authenticated: false, recipient: "none" });

    await ingestReceiptEmail(
      input({ messageId: "<2>", trust: { dmarc: "pass", recipient: { from: "given", ownership: "personal" } } })
    );
    expect(mocks.parseReceipt.mock.calls[1][0].raw).toMatchObject({ authenticated: true, recipient: "personal" });
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it("starts no further Claude call after the deadline", async () => {
    mocks.ocr.mockRejectedValue(new Error("timed out"));

    await ingestReceiptEmail(input({ rawEml: emlWithPdf(), deadline: Date.now() - 1 }));
    // Templates only, no second (LLM) pass of the text.
    expect(mocks.parseReceipt).toHaveBeenCalledTimes(1);

    mocks.parseReceipt.mockClear();
    await ingestReceiptEmail(input({ rawEml: emlWithPdf(), messageId: "<3>" }));
    expect(mocks.parseReceipt).toHaveBeenCalledTimes(2);
    expect(mocks.parseReceipt.mock.calls[1][0].raw).toMatchObject({ templatesOnly: false });
  });

  it("strips NUL from what it stores and parses", async () => {
    await ingestReceiptEmail(input({ subject: "Bad\u0000subject", text: "a\u0000b", html: "<p>\u0000</p>" }));
    expect(mocks.parseReceipt.mock.calls[0][0].raw).toMatchObject({ subject: "Badsubject", text: "ab", html: "<p></p>" });
    expect(mocks.receiptsInsert.mock.calls[0][0]).toMatchObject({ notes: "Subject: Badsubject" });
  });
});
