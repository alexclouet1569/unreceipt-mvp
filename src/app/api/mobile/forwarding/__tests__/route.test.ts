import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  getOrCreateAliasForUser: vi.fn(),
  listExtraAddresses: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/email-alias", () => ({
  getOrCreateAliasForUser: mocks.getOrCreateAliasForUser,
  buildForwardingAddress: (hash: string) => `receipts+${hash}@in.unreceipt.com`,
}));
vi.mock("@/lib/owner-addresses", () => ({ listExtraAddresses: mocks.listExtraAddresses, MAX_EXTRA_ADDRESSES: 10 }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "@/app/api/mobile/forwarding/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "anna@gmail.com" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue(USER);
  mocks.getOrCreateAliasForUser.mockResolvedValue("abc123");
  mocks.listExtraAddresses.mockResolvedValue(["anna@firma.se"]);
});

describe("GET /api/mobile/forwarding", () => {
  it("answers 401 without a signed-in user", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.getOrCreateAliasForUser).not.toHaveBeenCalled();
  });

  it("returns the address, the provider to start on and the website's labels", async () => {
    const res = await GET();
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.address).toBe("receipts+abc123@in.unreceipt.com");
    expect(body.suggested).toBe("gmail");
    expect(body.ownAddresses).toEqual({ signIn: USER.email, extra: ["anna@firma.se"], max: 10 });
    expect(body.labels.gmail.next).toEqual({ en: "Next", sv: "Nästa", fr: "Suivant" });
    // The doubt flag is for us, not for the app.
    expect(body.labels.gmail.next.verified).toBeUndefined();
    expect(body.gmailFilter).toMatch(/^subject:\(/);
    expect(body.icloudWords.sv[0]).toBe("kvitto");
    expect(body.links.gmailFilters).toBe("https://mail.google.com/mail/u/0/#settings/filters");
  });

  it("starts nowhere for an address it can't place", async () => {
    mocks.getServerUser.mockResolvedValue({ ...USER, email: "anna@firma.se" });
    expect((await (await GET()).json()).suggested).toBeNull();
  });
});
