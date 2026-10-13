// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchReceivedEmail } from "../resend-inbound";

const EMAIL_ID = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";

const receivedEmail = {
  object: "email",
  id: EMAIL_ID,
  to: ["receipts+abc@in.unreceipt.com"],
  from: "receipts@uber.com",
  subject: "Your trip",
  html: "<p>Total 189 kr</p>",
  html_format: "cid",
  text: "Total 189 kr",
  headers: { "message-id": "<m1@uber.com>" },
  message_id: "<m1@uber.com>",
  raw: { download_url: "https://resend.example/raw/abc?sig=1", expires_at: "2026-10-14T09:00:00Z" },
  attachments: [],
};

const okJson = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve("") });
const okBytes = (text: string) => ({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) });

describe("fetchReceivedEmail", () => {
  const fetchMock = vi.fn();
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retrieves the email (cid HTML) and downloads the original .eml", async () => {
    fetchMock
      .mockResolvedValueOnce(okJson(receivedEmail))
      .mockResolvedValueOnce(okBytes("From: receipts@uber.com\r\n\r\nTotal 189 kr"));

    const content = await fetchReceivedEmail(EMAIL_ID);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.resend.com/emails/receiving/${EMAIL_ID}?html_format=cid`
    );
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: "Bearer re_test_key" },
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://resend.example/raw/abc?sig=1");
    expect(content).toMatchObject({
      text: "Total 189 kr",
      html: "<p>Total 189 kr</p>",
      messageId: "<m1@uber.com>",
    });
    expect(content?.rawEml?.toString()).toContain("Total 189 kr");
  });

  it("still returns the body when the .eml download fails", async () => {
    fetchMock
      .mockResolvedValueOnce(okJson(receivedEmail))
      .mockResolvedValueOnce({ ok: false, status: 403 });

    const content = await fetchReceivedEmail(EMAIL_ID);

    expect(content?.text).toBe("Total 189 kr");
    expect(content?.rawEml).toBeNull();
  });

  it("returns null when Resend refuses (e.g. sending-only API key)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: () => Promise.resolve("restricted_api_key") });

    await expect(fetchReceivedEmail(EMAIL_ID)).resolves.toBeNull();
  });

  it("returns null without an API key and makes no request", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(fetchReceivedEmail(EMAIL_ID)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
