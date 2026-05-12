import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromBuilder: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  eq1: vi.fn(),
  eq2: vi.fn(),
  is: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: mocks.fromBuilder,
  }),
}));

import {
  buildForwardingAddress,
  findUserByAliasHash,
  generateAliasHash,
  getOrCreateAliasForUser,
  parseAliasFromTo,
} from "@/lib/email-alias";

const USER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateAliasHash", () => {
  it("returns 10 lowercase Crockford base32 chars", () => {
    for (let i = 0; i < 50; i++) {
      const h = generateAliasHash();
      expect(h).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/);
    }
  });
  it("does not repeat across many calls (entropy sanity check)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateAliasHash());
    expect(seen.size).toBe(200);
  });
});

describe("parseAliasFromTo", () => {
  it("extracts the tag from a bare address", () => {
    expect(parseAliasFromTo("receipts+abc12345mn@in.unreceipt.com")).toBe(
      "abc12345mn"
    );
  });
  it("extracts the tag from a display-name address", () => {
    expect(
      parseAliasFromTo('"Alex" <receipts+abc12345mn@in.unreceipt.com>')
    ).toBe("abc12345mn");
  });
  it("lowercases the tag", () => {
    expect(parseAliasFromTo("receipts+ABC12345MN@in.unreceipt.com")).toBe(
      "abc12345mn"
    );
  });
  it("returns null for non-receipts local parts", () => {
    expect(parseAliasFromTo("support+abc123@in.unreceipt.com")).toBeNull();
  });
  it("returns null for missing +tag", () => {
    expect(parseAliasFromTo("receipts@in.unreceipt.com")).toBeNull();
  });
  it("returns null for tags with disallowed chars", () => {
    expect(parseAliasFromTo("receipts+abc!12345@in.unreceipt.com")).toBeNull();
    expect(parseAliasFromTo("receipts+abciol1234@in.unreceipt.com")).toBeNull();
  });
  it("returns null for null/empty/non-string", () => {
    expect(parseAliasFromTo(null)).toBeNull();
    expect(parseAliasFromTo(undefined)).toBeNull();
    expect(parseAliasFromTo("")).toBeNull();
  });
});

describe("buildForwardingAddress", () => {
  it("formats receipts+<hash>@<domain>", () => {
    expect(buildForwardingAddress("abc12345mn")).toBe(
      "receipts+abc12345mn@in.unreceipt.com"
    );
  });
  it("honors INBOUND_DOMAIN env override", () => {
    const prev = process.env.INBOUND_DOMAIN;
    process.env.INBOUND_DOMAIN = "in.staging.unreceipt.com";
    try {
      expect(buildForwardingAddress("abc12345mn")).toBe(
        "receipts+abc12345mn@in.staging.unreceipt.com"
      );
    } finally {
      if (prev === undefined) delete process.env.INBOUND_DOMAIN;
      else process.env.INBOUND_DOMAIN = prev;
    }
  });
});

describe("getOrCreateAliasForUser", () => {
  function setupChainForRead(result: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.fromBuilder.mockReturnValueOnce({ select });
    return { maybeSingle, eq, select };
  }
  function setupChainForUpdate(result: { error: unknown }) {
    const is = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ is });
    const update = vi.fn().mockReturnValue({ eq });
    mocks.fromBuilder.mockReturnValueOnce({ update });
    return { update, eq, is };
  }

  it("returns the existing hash when present", async () => {
    setupChainForRead({
      data: { email_alias_hash: "existinghash" },
      error: null,
    });
    const hash = await getOrCreateAliasForUser(USER_ID);
    expect(hash).toBe("existinghash");
  });

  it("mints, writes, and re-reads when the profile has none", async () => {
    setupChainForRead({ data: { email_alias_hash: null }, error: null });
    setupChainForUpdate({ error: null });
    setupChainForRead({
      data: { email_alias_hash: "freshlyminted" },
      error: null,
    });
    const hash = await getOrCreateAliasForUser(USER_ID);
    expect(hash).toBe("freshlyminted");
  });

  it("returns null when the profile row is missing", async () => {
    setupChainForRead({ data: null, error: null });
    const hash = await getOrCreateAliasForUser(USER_ID);
    expect(hash).toBeNull();
  });

  it("on unique violation re-reads instead of retrying", async () => {
    setupChainForRead({ data: { email_alias_hash: null }, error: null });
    setupChainForUpdate({ error: { code: "23505" } });
    setupChainForRead({
      data: { email_alias_hash: "winnerhash9" },
      error: null,
    });
    const hash = await getOrCreateAliasForUser(USER_ID);
    expect(hash).toBe("winnerhash9");
  });
});

describe("findUserByAliasHash", () => {
  it("returns the matching user_id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: USER_ID },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.fromBuilder.mockReturnValueOnce({ select });

    const result = await findUserByAliasHash("abc12345mn");
    expect(result).toEqual({ user_id: USER_ID });
  });

  it("returns null when no row matches", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.fromBuilder.mockReturnValueOnce({ select });

    const result = await findUserByAliasHash("nosuchhash");
    expect(result).toBeNull();
  });
});
