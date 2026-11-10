import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  loadHome: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/home/load-home", () => ({ loadHome: mocks.loadHome }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "@/app/api/mobile/home/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "anna@firma.se" };

function receipt(over: Partial<Receipt>): Receipt {
  return {
    id: "r1",
    user_id: USER.id,
    source: "paper",
    merchant_name: "ICA Nära",
    category: "meals",
    currency: "SEK",
    total: 245,
    purchased_at: "2026-11-08T12:00:00Z",
    receipt_date: null,
    status: "verified",
    parse_confidence: 0.9,
    image_url: `${USER.id}/r1.jpg`,
    original_source_url: `${USER.id}/r1.jpg`,
    original_source_kind: "image/jpeg",
    notes: null,
    verification_code: "SECRET",
    edit_history: [],
    home_currency: "SEK",
    home_total: 245,
    fx_source: "same",
    created_at: "2026-11-08T12:00:01Z",
    exported_at: null,
    booked_at: null,
    ...over,
  } as Receipt;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue(USER);
});

describe("GET /api/mobile/home", () => {
  it("answers 401 without a signed-in user, and never caches", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mocks.loadHome).not.toHaveBeenCalled();
  });

  it("never passes a Stripe session id (no Checkout in the app)", async () => {
    mocks.loadHome.mockResolvedValue({ kind: "subscribe" });
    await GET();
    expect(mocks.loadHome).toHaveBeenCalledWith(USER, null);
  });

  it("tells firm-only staff apart, and gives a neutral state without a plan", async () => {
    mocks.loadHome.mockResolvedValueOnce({ kind: "firm_only" });
    expect(await (await GET()).json()).toEqual({ state: "firm_only", email: USER.email });

    mocks.loadHome.mockResolvedValueOnce({ kind: "subscribe" });
    expect(await (await GET()).json()).toEqual({ state: "inactive", email: USER.email });
  });

  it("returns the home screen with display fields only", async () => {
    mocks.loadHome.mockResolvedValue({
      kind: "ready",
      access: "pilot",
      data: {
        receipts: [
          receipt({}),
          receipt({
            id: "r2",
            merchant_name: null,
            total: null,
            status: "pending_review",
            image_url: null,
            original_source_url: null,
            original_source_kind: null,
          }),
        ],
        forwardingEmail: "abc@in.unreceipt.com",
        showOnboarding: false,
        accountantInvites: [{ id: "l1", firmName: "Byrå AB" }],
        homeCurrency: "SEK",
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      state: "ready",
      access: "pilot",
      email: USER.email,
      homeCurrency: "SEK",
      forwardingEmail: "abc@in.unreceipt.com",
      accountantInvites: [{ id: "l1", firmName: "Byrå AB" }],
    });
    expect(body.receipts[0]).toEqual({
      id: "r1",
      status: "verified",
      missing: [],
      source: "paper",
      merchant: "ICA Nära",
      category: "meals",
      currency: "SEK",
      total: 245,
      homeCurrency: "SEK",
      homeTotal: 245,
      fxSource: "same",
      date: "2026-11-08T12:00:00Z",
      createdAt: "2026-11-08T12:00:01Z",
      original: "image",
      notes: null,
      possibleDuplicate: false,
      exportedAt: null,
      bookedAt: null,
    });
    expect(body.receipts[1]).toMatchObject({ original: null, missing: ["merchant", "total"] });
    // No storage paths, codes or history leave the server.
    const text = JSON.stringify(body);
    expect(text).not.toContain(USER.id);
    expect(text).not.toContain("SECRET");
  });

  it("answers 500 when loading fails", async () => {
    mocks.loadHome.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
