// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";
import { parseAfter } from "@/lib/receipts/updates";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rateLimit: vi.fn(),
  access: vi.fn(),
  // Every query the route makes, with its filters.
  calls: [] as { select: string; filters: [string, ...unknown[]][] }[],
  answer: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: () => mocks.user() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => mocks.rateLimit(...a),
  rateLimitedResponse: (s: number) => Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(s) } }),
}));
vi.mock("@/lib/analytics/load", () => ({ analyticsAccess: () => mocks.access() }));
vi.mock("@/lib/fx", () => ({ ensureHomeAmounts: async (rows: unknown[]) => rows }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      expect(table).toBe("receipts");
      return {
        select: (select: string, opts?: { head?: boolean }) => {
          const call = { select: opts?.head ? "count" : select, filters: [] as [string, ...unknown[]][] };
          mocks.calls.push(call);
          const chain: Record<string, unknown> = {};
          for (const op of ["eq", "gt", "in", "order", "limit"]) {
            chain[op] = (...args: unknown[]) => {
              call.filters.push([op, ...args]);
              return chain;
            };
          }
          chain.then = (resolve: (v: unknown) => void) => resolve(mocks.answer(call));
          return chain;
        },
      };
    },
  }),
}));

const USER = "11111111-1111-4111-8111-111111111111";
const req = (q = "") => new Request(`http://localhost/api/receipts/updates${q}`);

function answers(call: { select: string; filters: [string, ...unknown[]][] }) {
  if (call.select === "count") return { count: 7, error: null };
  if (call.select === "created_at") return { data: [{ created_at: "2026-11-14T10:00:00.000Z" }], error: null };
  if (call.select === "updated_at") return { data: [{ updated_at: "2026-11-14T10:01:00.000Z" }], error: null };
  if (call.select === "id, created_at") return { data: [{ id: "r1", created_at: "2026-11-14T10:00:00.000Z" }], error: null };
  if (call.select === "*") return { data: [{ id: "r1", user_id: USER, source: "email", created_at: "2026-11-14T10:00:00.000Z" }], error: null };
  throw new Error(`unexpected ${call.select}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.user.mockResolvedValue({ id: USER });
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.access.mockResolvedValue({ kind: "ready", home: "SEK" });
  mocks.answer.mockImplementation(answers);
});

describe("parseAfter", () => {
  it("accepts a timestamp as Postgres writes it, nothing else", () => {
    expect(parseAfter("2026-11-14T10:00:00.123456+00:00")).toBe("2026-11-14T10:00:00.123456+00:00");
    expect(parseAfter("2026-11-14T10:00:00Z")).toBe("2026-11-14T10:00:00Z");
    for (const bad of [null, "", "yesterday", "2026-11-14", "2026-11-14T10:00:00Z,created_at.gt.0", "2026-13-45T99:00:00Z"]) {
      expect(parseAfter(bad)).toBeNull();
    }
  });
});

describe("GET /api/receipts/updates", () => {
  it("401 signed out, 400 on a malformed cursor or rows", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("?after=yesterday"))).status).toBe(400);
    expect((await GET(req("?rows=all"))).status).toBe(400);
  });

  it("429 over the limit before reading anything", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 20 });
    expect((await GET(req())).status).toBe(429);
    expect(mocks.calls).toHaveLength(0);
  });

  it("answers a version and the newest receipt, scoped to the user, without `after` no fresh list", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: "7|2026-11-14T10:00:00.000Z|2026-11-14T10:01:00.000Z",
      latestCreatedAt: "2026-11-14T10:00:00.000Z",
      fresh: [],
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith("receiptUpdates", USER);
    expect(mocks.calls).toHaveLength(3);
    for (const call of mocks.calls) expect(call.filters).toContainEqual(["eq", "user_id", USER]);
  });

  it("lists email receipts after the cursor, with rows for the app", async () => {
    const res = await GET(req("?after=2026-11-14T09:00:00.000Z&rows=mobile"));
    const body = await res.json();
    expect(body.fresh).toEqual([{ id: "r1", createdAt: "2026-11-14T10:00:00.000Z" }]);
    expect(body.receipts).toHaveLength(1);
    expect(body.receipts[0]).toMatchObject({ id: "r1", source: "email" });
    const freshCall = mocks.calls.find((c) => c.select === "id, created_at")!;
    expect(freshCall.filters).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["eq", "source", "email"],
        ["gt", "created_at", "2026-11-14T09:00:00.000Z"],
      ]),
    );
    const rowsCall = mocks.calls.find((c) => c.select === "*")!;
    expect(rowsCall.filters).toContainEqual(["eq", "user_id", USER]);
  });

  it("sends ids only without access", async () => {
    mocks.access.mockResolvedValue({ kind: "inactive" });
    const body = await (await GET(req("?after=2026-11-14T09:00:00.000Z&rows=web"))).json();
    expect(body.fresh).toHaveLength(1);
    expect(body.receipts).toBeUndefined();
    expect(mocks.calls.some((c) => c.select === "*")).toBe(false);
  });

  it("500 when a read fails", async () => {
    mocks.answer.mockImplementation((call) => (call.select === "count" ? { count: null, error: { message: "boom" } } : answers(call)));
    expect((await GET(req())).status).toBe(500);
  });
});
