// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Call = { table: string; op: string; args: unknown[]; filters: Array<[string, string, unknown]> };

const mocks = vi.hoisted(() => ({
  requireFirmMember: vi.fn(),
  requireFirmClientAccess: vi.fn(),
  rateLimit: vi.fn(),
  sendEmail: vi.fn(),
  loadBankMonth: vi.fn(),
  getUserById: vi.fn(),
  calls: [] as Call[],
  // Answers one awaited query.
  answer: vi.fn(),
}));

vi.mock("@/lib/require-firm", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-firm")>()),
  requireFirmMember: mocks.requireFirmMember,
  requireFirmClientAccess: mocks.requireFirmClientAccess,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/fx", () => ({ homeCurrencyOf: async () => "SEK" }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/bank/load", () => ({ loadBankMonth: mocks.loadBankMonth }));
vi.mock("@/lib/app-url", () => ({ appUrl: (p: string) => `https://app.unreceipt.com${p}` }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
    from: (table: string) => {
      const call: Call = { table, op: "select", args: [], filters: [] };
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "upsert", "update", "delete", "insert"]) {
        chain[op] = (...args: unknown[]) => {
          if (op !== "select" || call.op === "select") {
            call.op = op === "select" && call.args.length ? call.op : op;
            if (op !== "select") call.args = args;
          }
          return chain;
        };
      }
      for (const f of ["eq", "in", "gte", "lte", "is", "or", "order", "limit"]) {
        chain[f] = (col: string, val: unknown) => {
          call.filters.push([f, col, val]);
          return chain;
        };
      }
      const run = () => {
        mocks.calls.push(call);
        return Promise.resolve(mocks.answer(call));
      };
      chain.maybeSingle = run;
      chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => run().then(ok, bad);
      return chain;
    },
  }),
}));

import { FirmAuthError } from "@/lib/require-firm";
import { POST as importPost } from "@/app/api/firm/clients/[orgId]/bank/import/route";
import { PATCH as linePatch } from "@/app/api/firm/clients/[orgId]/bank/lines/[lineId]/route";
import { POST as remindPost } from "@/app/api/firm/clients/[orgId]/bank/remind/route";
import { DELETE as monthDelete } from "@/app/api/firm/clients/[orgId]/bank/route";

const ORG = "33333333-3333-4333-8333-333333333333";
const LINE = "44444444-4444-4444-8444-444444444444";
const RECEIPT = "22222222-2222-4222-8222-222222222222";
const CTX = {
  user: { id: "u-staff", email: "anna@byran.se", email_confirmed_at: "2026-01-01" },
  memberId: "fm-1",
  firmId: "firm-1",
  firmName: "Byrån AB",
  role: "staff",
};

const req = (path: string, method: string, body?: unknown) =>
  new NextRequest(`https://app.unreceipt.com/api/firm/clients/${ORG}/bank${path}`, {
    method,
    headers: { "content-type": "application/json", host: "app.unreceipt.com" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const orgParams = { params: Promise.resolve({ orgId: ORG }) };
const filter = (c: Call, col: string) => c.filters.find(([, k]) => k === col)?.[2];

beforeEach(() => {
  mocks.requireFirmMember.mockReset().mockResolvedValue(CTX);
  mocks.requireFirmClientAccess.mockReset().mockResolvedValue({ firmClientId: "fc", organizationId: ORG, clientName: "Acme AB" });
  mocks.rateLimit.mockReset().mockResolvedValue({ ok: true });
  mocks.sendEmail.mockReset().mockResolvedValue({ ok: true, id: "e1" });
  mocks.loadBankMonth.mockReset();
  mocks.getUserById.mockReset().mockResolvedValue({ data: { user: { email: "owner@acme.se", email_confirmed_at: "2026-01-01" } } });
  mocks.answer.mockReset().mockReturnValue({ data: [], error: null });
  mocks.calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST bank/import", () => {
  const CSV = "Datum;Text;Belopp\n2026-11-03;BYGGMAX;-2 486,00\n2026-11-03;BYGGMAX;-2 486,00\n2026-11-04;KUND AB;500,00\n";

  it("stores the lines under the checked company, with hashed dedupe keys, and counts what was new", async () => {
    mocks.answer.mockReturnValue({ data: [{ id: "a" }, { id: "b" }], error: null });
    const res = await importPost(req("/import", "POST", { csv: CSV }), orgParams);
    expect(res.status).toBe(200);
    // The incoming payment is not kept.
    expect(await res.json()).toMatchObject({ imported: 2, duplicates: 0, lines: 2, moneyIn: 1, from: "2026-11-03", to: "2026-11-03", months: ["2026-11"] });
    const insert = mocks.calls.find((c) => c.op === "upsert")!;
    expect(insert.table).toBe("bank_transactions");
    const rows = insert.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => Number(r.amount) < 0)).toBe(true);
    expect(rows.every((r) => r.organization_id === ORG && r.currency === "SEK" && r.imported_by === "u-staff")).toBe(true);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(String(r.dedupe_key)))).toBe(true);
    // Two identical lines on one day stay two lines.
    expect(rows[0].dedupe_key).not.toBe(rows[1].dedupe_key);
    expect(insert.args[1]).toEqual({ onConflict: "organization_id,dedupe_key", ignoreDuplicates: true });
  });

  it("refuses an import that would take the company over the line ceiling", async () => {
    mocks.answer.mockImplementation(() => ({ data: null, count: 49_999, error: null }));
    const res = await importPost(req("/import", "POST", { csv: CSV }), orgParams);
    expect(res.status).toBe(413);
    expect(mocks.calls.some((c) => c.op === "upsert")).toBe(false);
    // Limited per user and per company.
    expect(mocks.rateLimit).toHaveBeenCalledWith("bankImport", "u-staff");
    expect(mocks.rateLimit).toHaveBeenCalledWith("bankImportOrg", ORG);
  });

  it("refuses a file with only money in", async () => {
    const res = await importPost(req("/import", "POST", { csv: "Datum;Text;Belopp\n2026-11-04;KUND AB;500,00\n" }), orgParams);
    expect(res.status).toBe(422);
    expect(mocks.calls).toHaveLength(0);
  });

  it("explains an unreadable file without writing anything", async () => {
    const res = await importPost(req("/import", "POST", { csv: "a;b\n1;2" }), orgParams);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("Belopp");
    expect(mocks.calls).toHaveLength(0);
  });

  it("answers 404 for a client the firm isn't linked to, 429 when over the limit", async () => {
    mocks.requireFirmClientAccess.mockRejectedValueOnce(new FirmAuthError("no_access"));
    expect((await importPost(req("/import", "POST", { csv: CSV }), orgParams)).status).toBe(404);
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 60 });
    expect((await importPost(req("/import", "POST", { csv: CSV }), orgParams)).status).toBe(429);
    expect(mocks.calls).toHaveLength(0);
  });

  it("refuses a request from another site", async () => {
    const r = new NextRequest(`https://app.unreceipt.com/api/firm/clients/${ORG}/bank/import`, {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.unreceipt.com", origin: "https://evil.example" },
      body: JSON.stringify({ csv: CSV }),
    });
    expect((await importPost(r, orgParams)).status).toBe(403);
  });
});

describe("PATCH bank/lines/[lineId]", () => {
  const params = { params: Promise.resolve({ orgId: ORG, lineId: LINE }) };

  it("links a receipt of the same company, scoped by company", async () => {
    mocks.answer.mockImplementation((c: Call) =>
      c.table === "receipts" ? { data: { id: RECEIPT }, error: null } : { data: [{ id: LINE }], error: null }
    );
    const res = await linePatch(req(`/lines/${LINE}`, "PATCH", { action: "link", receiptId: RECEIPT }), params);
    expect(res.status).toBe(200);
    const [check, update] = mocks.calls;
    expect(filter(check, "organization_id")).toBe(ORG);
    expect(update.op).toBe("update");
    expect(update.args[0]).toMatchObject({ linked_receipt_id: RECEIPT, no_receipt_reason: null, decided_by: "u-staff" });
    expect(filter(update, "organization_id")).toBe(ORG);
    expect(filter(update, "id")).toBe(LINE);
  });

  it("answers 404 for a receipt of another company and never updates", async () => {
    mocks.answer.mockReturnValue({ data: null, error: null });
    const res = await linePatch(req(`/lines/${LINE}`, "PATCH", { action: "link", receiptId: RECEIPT }), params);
    expect(res.status).toBe(404);
    expect(mocks.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("answers 409 when the receipt already pays another line", async () => {
    mocks.answer.mockImplementation((c: Call) =>
      c.table === "receipts" ? { data: { id: RECEIPT }, error: null } : { data: null, error: { code: "23505" } }
    );
    const res = await linePatch(req(`/lines/${LINE}`, "PATCH", { action: "link", receiptId: RECEIPT }), params);
    expect(res.status).toBe(409);
  });

  it("marks no receipt needed with a known reason only, and clears", async () => {
    mocks.answer.mockReturnValue({ data: [{ id: LINE }], error: null });
    expect((await linePatch(req(`/lines/${LINE}`, "PATCH", { action: "no_receipt", reason: "bank_fee" }), params)).status).toBe(200);
    expect(mocks.calls[0].args[0]).toMatchObject({ no_receipt_reason: "bank_fee", linked_receipt_id: null });
    expect((await linePatch(req(`/lines/${LINE}`, "PATCH", { action: "no_receipt", reason: "lunch" }), params)).status).toBe(400);
    expect((await linePatch(req(`/lines/${LINE}`, "PATCH", { action: "clear" }), params)).status).toBe(200);
    expect(mocks.calls.at(-1)!.args[0]).toEqual({ linked_receipt_id: null, no_receipt_reason: null, decided_by: null, decided_at: null });
  });

  it("answers 404 when the line isn't the company's", async () => {
    mocks.answer.mockReturnValue({ data: [], error: null });
    expect((await linePatch(req(`/lines/${LINE}`, "PATCH", { action: "clear" }), params)).status).toBe(404);
  });
});

describe("POST bank/remind", () => {
  const missingLine = (id: string, amount: number, description: string) => ({
    id,
    bookedOn: "2026-11-05",
    amount,
    currency: "SEK",
    description,
    state: { kind: "missing" },
    receipt: null,
    remindedAt: null,
  });

  it("emails the company's owners the missing payments, the accountant as Reply-To, and stamps the lines", async () => {
    mocks.loadBankMonth.mockResolvedValue({
      lines: [missingLine("l1", -1249, "HORNBACH BARKARBY"), { ...missingLine("l2", -812, "CIRCLE K"), state: { kind: "matched" } }],
      missingTotals: [{ currency: "SEK", amount: 1249 }],
    });
    mocks.answer.mockImplementation((c: Call) =>
      c.table === "memberships" ? { data: [{ user_id: "owner-1" }], error: null } : { data: [], error: null }
    );
    const res = await remindPost(req("/remind", "POST", { month: "2026-11" }), orgParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1, lines: 1 });
    expect(mocks.loadBankMonth).toHaveBeenCalledWith(ORG, "2026-11", "SEK");
    expect(mocks.rateLimit).toHaveBeenCalledWith("bankReminder", ORG);
    const email = mocks.sendEmail.mock.calls[0][0];
    expect(email).toMatchObject({ to: "owner@acme.se", replyTo: "anna@byran.se", tag: "missing_receipts" });
    expect(email.text).toContain("HORNBACH BARKARBY");
    expect(email.text).not.toContain("CIRCLE K");
    expect(email.subject).toBe("1 receipt missing for November 2026 — Byrån AB");
    const members = mocks.calls.find((c) => c.table === "memberships")!;
    expect(filter(members, "organization_id")).toBe(ORG);
    // Logged for the pilot dashboard: counts only.
    const log = mocks.calls.find((c) => c.op === "insert")!;
    expect(log.table).toBe("client_reminders");
    expect(log.args[0]).toEqual({ organization_id: ORG, firm_id: "firm-1", kind: "manual", missing_count: 1, recipients: 1 });
    const stamp = mocks.calls.find((c) => c.op === "update")!;
    expect(filter(stamp, "organization_id")).toBe(ORG);
    expect(filter(stamp, "id")).toEqual(["l1"]);
  });

  it("sends nothing when nothing is missing, or when over the limit", async () => {
    mocks.loadBankMonth.mockResolvedValue({ lines: [], missingTotals: [] });
    expect((await remindPost(req("/remind", "POST", { month: "2026-11" }), orgParams)).status).toBe(409);
    mocks.loadBankMonth.mockResolvedValue({ lines: [missingLine("l1", -10, "X")], missingTotals: [] });
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 3600 });
    expect((await remindPost(req("/remind", "POST", { month: "2026-11" }), orgParams)).status).toBe(429);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("doesn't stamp the lines when no email went out", async () => {
    mocks.loadBankMonth.mockResolvedValue({ lines: [missingLine("l1", -10, "X")], missingTotals: [{ currency: "SEK", amount: 10 }] });
    mocks.answer.mockImplementation((c: Call) =>
      c.table === "memberships" ? { data: [{ user_id: "owner-1" }], error: null } : { data: [], error: null }
    );
    mocks.sendEmail.mockResolvedValue({ ok: false, reason: "rejected" });
    expect((await remindPost(req("/remind", "POST", { month: "2026-11" }), orgParams)).status).toBe(502);
    expect(mocks.calls.some((c) => c.op === "update")).toBe(false);
  });
});

describe("DELETE bank?month=", () => {
  it("removes the month's lines of the checked company only", async () => {
    mocks.answer.mockReturnValue({ data: [{ id: "a" }, { id: "b" }], error: null });
    const res = await monthDelete(req("?month=2026-02", "DELETE"), orgParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed: 2 });
    const c = mocks.calls[0];
    expect(c.op).toBe("delete");
    expect(c.table).toBe("bank_transactions");
    expect(filter(c, "organization_id")).toBe(ORG);
    expect(c.filters).toContainEqual(["gte", "booked_on", "2026-02-01"]);
    expect(c.filters).toContainEqual(["lte", "booked_on", "2026-02-28"]);
  });

  it("validates the month", async () => {
    expect((await monthDelete(req("?month=2026-13", "DELETE"), orgParams)).status).toBe(400);
    expect(mocks.calls).toHaveLength(0);
  });
});
