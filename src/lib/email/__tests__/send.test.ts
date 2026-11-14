// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

import { sendEmail, type OutgoingEmail } from "../send";

const EMAIL: OutgoingEmail = {
  to: "anna@example.se",
  subject: "Secret subject",
  html: "<p>receipt body</p>",
  text: "receipt body",
  tag: "weekly_reminder",
};

const fetchMock = vi.fn();
const originalKey = process.env.RESEND_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "re_test";
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
});

// Nothing personal may reach Sentry: no address, subject or content.
function expectNothingPersonal() {
  const sent = JSON.stringify([...sentry.captureMessage.mock.calls, ...sentry.captureException.mock.calls]);
  expect(sent).not.toContain("anna@example.se");
  expect(sent).not.toContain("Secret subject");
  expect(sent).not.toContain("receipt body");
}

describe("sendEmail failure reporting", () => {
  it("reports nothing when Resend accepts the email", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    expect(await sendEmail(EMAIL)).toEqual({ ok: true, id: "em_1" });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("reports a rejected send to Sentry with the flow tag and status only", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid `to` field: anna@example.se" }), { status: 422 })
    );
    expect(await sendEmail(EMAIL)).toEqual({ ok: false, reason: "rejected", status: 422 });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = sentry.captureMessage.mock.calls[0];
    expect(message).toContain("weekly_reminder");
    expect(context).toMatchObject({
      level: "error",
      tags: { area: "email", tag: "weekly_reminder", reason: "rejected" },
      extra: { status: 422 },
    });
    expectNothingPersonal();
  });

  it("reports an unreachable Resend", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await sendEmail(EMAIL)).toEqual({ ok: false, reason: "network" });
    expect(sentry.captureMessage.mock.calls[0][1]).toMatchObject({
      tags: { area: "email", tag: "weekly_reminder", reason: "network" },
    });
    expectNothingPersonal();
  });

  it("reports a missing API key as a warning", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail(EMAIL)).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sentry.captureMessage.mock.calls[0][1]).toMatchObject({
      level: "warning",
      tags: { area: "email", reason: "not_configured" },
    });
  });
});
