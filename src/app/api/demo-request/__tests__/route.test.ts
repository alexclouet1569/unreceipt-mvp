import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  fetch: vi.fn(),
  captureMessage: vi.fn(),
}));

type Limited = { ok: true } | { ok: false; retryAfterSeconds: number };
const rateLimitMock = vi.hoisted(() =>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  vi.fn(async (_name: string, _subject: string): Promise<Limited> => ({ ok: true }))
);
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: rateLimitMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      expect(table).toBe("demo_requests");
      return { insert: mocks.insert };
    },
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
  captureException: vi.fn(),
}));

import { POST } from "@/app/api/demo-request/route";

const VALID = {
  name: "  Maja Berg ",
  company: "Nordljus <b>Design</b> AB",
  email: " Maja@NordljusDesign.SE ",
  phone: "+46 70 123 45 67",
  employees: "6-15",
  bookkeeping: "fortnox",
  hasAccountant: true,
  message: "Utlägg för <script>alert(1)</script> säljarna",
  website: "",
  locale: "sv",
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("https://unreceipt.com/api/demo-request", {
      method: "POST",
      headers: { host: "unreceipt.com", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

const sentEmails = () =>
  mocks.fetch.mock.calls.map((c) => JSON.parse(String(c[1]?.body ?? "{}")));

describe("POST /api/demo-request", () => {
  const originalEnv = { ...process.env };
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_123";
    process.env.CONCIERGE_ADMIN_EMAILS = "founder@example.com, other@example.com";
    process.env.NEXT_PUBLIC_DEMO_BOOKING_URL = "https://cal.eu/founder/demo";
    rateLimitMock.mockReset().mockResolvedValue({ ok: true });
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    mocks.captureMessage.mockReset();
    mocks.fetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "email_1" }),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mocks.fetch);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  it("stores the normalised request and emails the founder and the requester", async () => {
    const res = await post(VALID, { origin: "https://unreceipt.com", "x-forwarded-for": "203.0.113.7" });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, confirmation: true });
    expect(rateLimitMock).toHaveBeenCalledWith("demoRequest", "203.0.113.7");
    expect(mocks.insert).toHaveBeenCalledWith({
      kind: "demo",
      locale: "sv",
      name: "Maja Berg",
      company: "Nordljus <b>Design</b> AB",
      email: "maja@nordljusdesign.se",
      phone: "+46 70 123 45 67",
      employees: "6-15",
      bookkeeping: "fortnox",
      has_accountant: true,
      message: "Utlägg för <script>alert(1)</script> säljarna",
    });

    const emails = sentEmails();
    expect(emails).toHaveLength(2);
    const founder = emails.find((e) => e.to === "founder@example.com")!;
    expect(founder.reply_to).toBe("maja@nordljusdesign.se");
    expect(founder.subject).toBe("Demo request: Nordljus <b>Design</b> AB (6-15 employees)");
    expect(founder.html).toContain("Nordljus &lt;b&gt;Design&lt;/b&gt; AB");
    expect(founder.html).toContain("&lt;script&gt;");
    expect(founder.html).not.toContain("<script>");
    expect(founder.html).toContain("Fortnox");
    expect(founder.text).toContain("Has an accountant: Yes");

    const confirmation = emails.find((e) => e.to === "maja@nordljusdesign.se")!;
    expect(confirmation.reply_to).toBe("founder@example.com");
    expect(confirmation.subject).toBe("Vi har fått din demoförfrågan");
    expect(confirmation.html).toContain('lang="sv"');
    expect(confirmation.html).toContain("https://cal.eu/founder/demo");
    // Nothing the visitor typed goes back out to the typed address.
    for (const typed of ["Maja", "Nordljus", "script", "Utlägg", "+46"]) {
      expect(confirmation.html).not.toContain(typed);
      expect(confirmation.text).not.toContain(typed);
    }
    expect(confirmation.tags).toEqual([{ name: "flow", value: "demo_request_confirmation" }]);
  });

  it("stores empty optional fields as null and sends the English confirmation", async () => {
    const res = await post({ ...VALID, phone: "", message: "   ", locale: "en", hasAccountant: false });

    expect(res.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, message: null, locale: "en", has_accountant: false })
    );
    const confirmation = sentEmails().find((e) => e.to === "maja@nordljusdesign.se")!;
    expect(confirmation.subject).toBe("We got your demo request");
  });

  it.each([
    ["missing name", { name: "" }, "name"],
    ["unknown employee band", { employees: "7" }, "employees"],
    ["unknown software", { bookkeeping: "excel" }, "bookkeeping"],
    ["bad email", { email: "maja@" }, "email"],
    ["bad phone", { phone: "call me maybe" }, "phone"],
    ["message too long", { message: "x".repeat(2001) }, "message"],
    ["company too long", { company: "x".repeat(121) }, "company"],
    ["unknown locale", { locale: "de" }, "locale"],
    ["accountant not a boolean", { hasAccountant: "yes" }, "hasAccountant"],
    ["line break in the name", { name: "Bo\nEmail: ceo@victim.se" }, "name"],
    ["line break in the company", { company: "AB\r\nPhone: 1" }, "company"],
    ["line break in the phone", { phone: "070 123\n45 67" }, "phone"],
  ])("rejects %s with 400 and stores nothing", async (_label, override, field) => {
    const res = await post({ ...VALID, ...override });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid");
    expect(json.fields).toContain(field);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects a body that isn't JSON", async () => {
    const res = await post("not json");
    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("answers ok to a filled honeypot and stores or sends nothing", async () => {
    const res = await post({ ...VALID, website: "https://spam.example" });

    expect(res.status).toBe(200);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 429 per IP before touching the database or sending email", async () => {
    rateLimitMock.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 600 });

    const res = await post(VALID);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("stops every request once the day's overall cap is reached", async () => {
    rateLimitMock.mockImplementation(async (name: string): Promise<Limited> =>
      name === "demoRequestAll" ? { ok: false, retryAfterSeconds: 7200 } : { ok: true }
    );

    const res = await post(VALID);

    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith("demoRequestAll", "all");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("counts Gmail aliases of one inbox as the same address for confirmations", async () => {
    await post({ ...VALID, email: "Victim+1@gmail.com" });
    await post({ ...VALID, email: "v.ictim@googlemail.com" });

    const keys = rateLimitMock.mock.calls.filter((c) => c[0] === "demoRequestConfirm").map((c) => c[1]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("refuses a cross-site POST", async () => {
    const res = await post(VALID, { origin: "https://evil.example" });

    expect(res.status).toBe(403);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 500 without sending email or logging what was typed when the insert fails", async () => {
    mocks.insert.mockResolvedValue({
      error: { code: "23514", message: "check violation", details: "Failing row contains (Maja Berg, …)" },
    });

    const res = await post(VALID);

    expect(res.status).toBe(500);
    expect(mocks.fetch).not.toHaveBeenCalled();
    const logged = JSON.stringify([consoleErrorSpy.mock.calls, mocks.captureMessage.mock.calls]);
    expect(logged).toContain("23514");
    expect(logged).not.toContain("Maja");
    expect(logged).not.toContain("nordljus");
  });

  it("still answers 201 when Resend fails", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("down") });

    const res = await post(VALID);

    expect(res.status).toBe(201);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("sends only the confirmation when no founder address is set", async () => {
    process.env.CONCIERGE_ADMIN_EMAILS = "";

    const res = await post(VALID);

    expect(res.status).toBe(201);
    const emails = sentEmails();
    expect(emails.map((e) => e.to)).toEqual(["maja@nordljusdesign.se"]);
    expect(emails[0].reply_to).toBeUndefined();
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("no founder address"),
      expect.objectContaining({ tags: { area: "demo_request" } })
    );
  });

  it("sends only the founder email once the address had its confirmations", async () => {
    rateLimitMock.mockImplementation(async (name: string): Promise<Limited> =>
      name === "demoRequestConfirm" ? { ok: false, retryAfterSeconds: 3600 } : { ok: true }
    );

    const res = await post(VALID);

    expect(res.status).toBe(201);
    expect((await res.json()).confirmation).toBe(false);
    expect(sentEmails().map((e) => e.to)).toEqual(["founder@example.com"]);
    // The per-address counter never sees the address itself.
    const confirmCall = rateLimitMock.mock.calls.find((c) => c[0] === "demoRequestConfirm")!;
    expect(confirmCall[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("still saves the request and emails the founder once all confirmations for the day are used", async () => {
    rateLimitMock.mockImplementation(async (name: string): Promise<Limited> =>
      name === "demoRequestConfirmAll" ? { ok: false, retryAfterSeconds: 3600 } : { ok: true }
    );

    const res = await post(VALID);

    expect(res.status).toBe(201);
    expect((await res.json()).confirmation).toBe(false);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(sentEmails().map((e) => e.to)).toEqual(["founder@example.com"]);
    expect(rateLimitMock).toHaveBeenCalledWith("demoRequestConfirmAll", "all");
  });

  it("refuses control characters other than line breaks in the message", async () => {
    const res = await post({ ...VALID, message: "a\u0000b" });

    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
    const ok = await post({ ...VALID, message: "line one\nline two\tend" });
    expect(ok.status).toBe(201);
  });

  it("leaves the booking link out of the confirmation when none is set", async () => {
    delete process.env.NEXT_PUBLIC_DEMO_BOOKING_URL;

    await post(VALID);

    const confirmation = sentEmails().find((e) => e.to === "maja@nordljusdesign.se")!;
    expect(confirmation.html).not.toContain("cal.eu");
    // The only link left is the footer's link to unreceipt.com.
    const links = confirmation.text.match(/https?:\/\/\S+/g) ?? [];
    expect(links.every((l: string) => l.startsWith("https://unreceipt.com/"))).toBe(true);
  });

  it("stores another request with its message and no company questions", async () => {
    process.env.NEXT_PUBLIC_DEMO_BOOKING_URL = "https://cal.eu/unreceipt/demo";
    const res = await post({
      kind: "question",
      name: "Anne Martin",
      company: "Cabinet Martin",
      email: "anne@cabinet-martin.fr",
      message: "Do you support French e-invoices?",
      locale: "fr",
    });

    expect(res.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "question",
        locale: "fr",
        employees: null,
        bookkeeping: null,
        has_accountant: null,
        message: "Do you support French e-invoices?",
      })
    );
    const founder = sentEmails().find((e) => e.to === "founder@example.com")!;
    expect(founder.subject).toBe("Request: Cabinet Martin");
    const confirmation = sentEmails().find((e) => e.to === "anne@cabinet-martin.fr")!;
    expect(confirmation.subject).toBe("Nous avons reçu votre message");
    // Another request gets no booking link.
    expect(confirmation.html).not.toContain("cal.eu");
  });

  it("refuses a lone surrogate in typed text before saving anything", async () => {
    for (const body of [{ ...VALID, message: "x\ud800y" }, { ...VALID, name: "Maja\udc00" }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("refuses another request without a message, and a demo request without the company questions", async () => {
    const question = await post({ ...VALID, kind: "question", message: "" });
    expect(question.status).toBe(400);
    expect((await question.json()).fields).toEqual(["message"]);

    const demo = await post({ ...VALID, kind: "demo", employees: "", bookkeeping: "", hasAccountant: null });
    expect(demo.status).toBe(400);
    expect((await demo.json()).fields).toEqual(["employees", "bookkeeping", "hasAccountant"]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
