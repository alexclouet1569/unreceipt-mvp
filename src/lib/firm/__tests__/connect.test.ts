// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

// A tiny stand-in for the Supabase query builder: every call is recorded,
// and `answer` decides what each query returns.
type Call = { table: string; op: string; values?: unknown; filters: [string, string, unknown][] };
const db = vi.hoisted(() => ({
  calls: [] as Call[],
  answer: ((): { data?: unknown; error?: { code?: string; message?: string } | null } => ({ data: null, error: null })) as (c: Call) => { data?: unknown; error?: { code?: string; message?: string } | null },
}));

function builder(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const done = () => {
    db.calls.push(call);
    return Promise.resolve({ data: null, error: null, ...db.answer(call) });
  };
  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: (values: unknown) => ((call.op = "insert"), (call.values = values), chain),
    update: (values: unknown) => ((call.op = "update"), (call.values = values), chain),
    order: () => chain,
    limit: () => chain,
    maybeSingle: done,
    single: done,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => done().then(resolve, reject),
  };
  for (const f of ["eq", "is", "in", "gt"]) {
    chain[f] = (col: string, v: unknown) => (call.filters.push([f, col, v]), chain);
  }
  return chain;
}

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: builder }) }));
const orgs = vi.hoisted(() => ({ existing: "org-1" as string | null, created: "org-new" }));
vi.mock("@/lib/organizations", () => ({
  getDefaultOrganizationId: async () => orgs.existing,
  getOrCreateDefaultOrganization: async () => orgs.existing ?? orgs.created,
}));
const confirm = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../link-emails", () => ({ sendLinkConfirmation: confirm }));
const seats = vi.hoisted(() => ({ membership: null as unknown, pending: null as { firmName: string } | null }));
vi.mock("@/lib/require-firm", () => ({
  getFirmMembership: async () => seats.membership,
  findPendingFirmSeat: async () => seats.pending,
}));

import { connectState, connectToFirm } from "../connect";

const USER = { id: "user-1", email: "Anna@Hallonbygg.se", email_confirmed_at: "2026-01-01T00:00:00Z" } as unknown as User;
const TARGET = { firmId: "firm-1", firmName: "Bergström Redovisning AB", adminDomain: null };

const has = (c: Call, f: string, col: string, v?: unknown) =>
  c.filters.some(([ff, cc, vv]) => ff === f && cc === col && (v === undefined || vv === v));

function world(opts: { member?: boolean; activeFirm?: string | null; insertError?: string } = {}) {
  db.answer = (c) => {
    if (c.table === "firm_members") return { data: opts.member ? { id: "fm" } : null };
    if (c.table === "organizations") return { data: { name: "Hallonbergen Bygg AB" } };
    if (c.table === "firm_clients" && c.op === "select")
      return { data: opts.activeFirm ? { firm_id: opts.activeFirm, firms: { name: "Other Byrå" } } : null };
    if (c.table === "firm_clients" && c.op === "insert")
      return opts.insertError ? { error: { code: opts.insertError } } : { data: null };
    return { data: null };
  };
}

beforeEach(() => {
  db.calls = [];
  orgs.existing = "org-1";
  seats.membership = null;
  seats.pending = null;
  confirm.mockClear();
});

describe("connectState (what the join page offers)", () => {
  it("open, with the company's name", async () => {
    world();
    expect(await connectState(USER, TARGET)).toEqual({ kind: "open", companyName: "Hallonbergen Bygg AB" });
    expect(db.calls.every((c) => c.op === "select")).toBe(true);
  });
  it("own firm, already connected, another firm", async () => {
    world({ member: true });
    expect(await connectState(USER, TARGET)).toEqual({ kind: "own_firm" });
    world({ activeFirm: "firm-1" });
    expect(await connectState(USER, TARGET)).toEqual({ kind: "already" });
    world({ activeFirm: "firm-2" });
    expect(await connectState(USER, TARGET)).toEqual({ kind: "other_firm", firmName: "Other Byrå" });
  });
  it("creates nothing for a user without a company yet", async () => {
    orgs.existing = null;
    world();
    expect(await connectState(USER, TARGET)).toEqual({ kind: "open", companyName: null });
    expect(db.calls.some((c) => c.op !== "select")).toBe(false);
  });
});

describe("connectToFirm (Yes, share)", () => {
  it("links the caller's own company, closes what it replaces, and confirms by email", async () => {
    world();
    expect(await connectToFirm(USER, TARGET)).toEqual({ ok: true });
    const insert = db.calls.find((c) => c.op === "insert")!;
    expect(insert.values).toMatchObject({
      firm_id: "firm-1",
      organization_id: "org-1",
      direction: "firm",
      status: "active",
      client_name: "Hallonbergen Bygg AB",
      invited_email: "anna@hallonbygg.se",
      accepted_by: "user-1",
      via_join_link: true,
    });
    const updates = db.calls.filter((c) => c.op === "update");
    // The company's waiting request to another accountant…
    expect(updates.some((c) => has(c, "eq", "organization_id", "org-1") && has(c, "eq", "direction", "client") && has(c, "eq", "status", "invited"))).toBe(true);
    // …and this firm's own waiting invite to the same address.
    expect(updates.some((c) => has(c, "eq", "firm_id", "firm-1") && has(c, "eq", "invited_email", "anna@hallonbygg.se") && has(c, "eq", "status", "invited"))).toBe(true);
    // Nothing else is touched: every update is scoped to waiting invites.
    expect(updates.every((c) => has(c, "eq", "status", "invited"))).toBe(true);
    expect(confirm).toHaveBeenCalledWith({ clientUserId: "user-1", firmId: "firm-1" });
  });

  it("refuses the firm's own staff, a second link, and another firm's client", async () => {
    world({ member: true });
    expect(await connectToFirm(USER, TARGET)).toEqual({ ok: false, reason: "own_firm" });
    world({ activeFirm: "firm-1" });
    expect(await connectToFirm(USER, TARGET)).toEqual({ ok: false, reason: "already" });
    world({ activeFirm: "firm-2" });
    expect(await connectToFirm(USER, TARGET)).toEqual({ ok: false, reason: "other_firm" });
    expect(db.calls.some((c) => c.op === "insert")).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("answers a race on the one-firm-per-company rule without a second link", async () => {
    world({ insertError: "23505" });
    const result = await connectToFirm(USER, TARGET);
    expect(result.ok).toBe(false);
    expect(db.calls.some((c) => c.op === "update")).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("refusals before anything is written (security review 2026-11-15)", () => {
  it("needs a confirmed address: an unconfirmed one could close the real person's invite", async () => {
    world();
    const unconfirmed = { ...USER, email_confirmed_at: null, confirmed_at: null } as unknown as User;
    expect(await connectState(unconfirmed, TARGET)).toEqual({ kind: "unconfirmed" });
    expect(await connectToFirm(unconfirmed, TARGET)).toEqual({ ok: false, reason: "unconfirmed" });
    expect(db.calls.some((c) => c.op !== "select")).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("sends someone with a waiting staff seat to join that firm first, without creating a company", async () => {
    world();
    seats.pending = { firmName: "Annan Byrå" };
    orgs.existing = null;
    expect(await connectState(USER, TARGET)).toEqual({ kind: "join_firm_first", firmName: "Annan Byrå" });
    expect(await connectToFirm(USER, TARGET)).toEqual({ ok: false, reason: "join_firm_first" });
    expect(db.calls.some((c) => c.op !== "select")).toBe(false);
  });
});
