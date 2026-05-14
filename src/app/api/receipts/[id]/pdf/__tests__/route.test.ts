// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Receipt } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  maybeSingle: vi.fn(),
  eqId: vi.fn(),
  eqUser: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mocks.getServerUser,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      mocks.from(table);
      // Two-step .eq() chain followed by .maybeSingle()
      const chain2 = { maybeSingle: mocks.maybeSingle };
      const chain1 = {
        eq: (col: string, val: string) => {
          mocks.eqUser(col, val);
          return chain2;
        },
      };
      return {
        select: (cols: string) => {
          mocks.select(cols);
          return {
            eq: (col: string, val: string) => {
              mocks.eqId(col, val);
              return chain1;
            },
          };
        },
      };
    },
  }),
}));

import { GET } from "@/app/api/receipts/[id]/pdf/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

const fakeReceipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: RECEIPT_ID,
  transaction_id: null,
  user_id: USER_ID,
  source: "manual",
  merchant_name: "ICA Maxi",
  merchant_address: null,
  merchant_phone: null,
  merchant_vat_number: null,
  merchant_siret: null,
  category: "meals",
  currency: "EUR",
  notes: null,
  receipt_number: null,
  receipt_date: "2026-05-03",
  receipt_time: null,
  purchased_at: "2026-05-03T12:00:00.000Z",
  subtotal: 40,
  tax_amount: 9,
  tax_rate: 25,
  tip_amount: null,
  total: 49,
  payment_method: "Visa",
  card_last_four: "1234",
  transaction_ref: null,
  image_url: null,
  image_captured_at: null,
  verification_code: null,
  capture_time_seconds: null,
  ocr_confidence: null,
  is_verified: true,
  original_source_url: null,
  original_source_kind: null,
  intake_ref: null,
  parse_confidence: null,
  items: null,
  created_at: "2026-05-03T12:00:00.000Z",
  updated_at: "2026-05-03T12:00:00.000Z",
  ...overrides,
});

const buildRequest = () =>
  new NextRequest(`http://localhost:3000/api/receipts/${RECEIPT_ID}/pdf`);

const params = { params: Promise.resolve({ id: RECEIPT_ID }) };

describe("GET /api/receipts/[id]/pdf", () => {
  beforeEach(() => {
    mocks.getServerUser.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.eqId.mockReset();
    mocks.eqUser.mockReset();
    mocks.select.mockReset();
    mocks.from.mockReset();
  });

  it("returns 401 when no user is logged in", async () => {
    mocks.getServerUser.mockResolvedValue(null);

    const res = await GET(buildRequest(), params);

    expect(res.status).toBe(401);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it("returns 404 when the id is not a valid UUID", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });

    const res = await GET(
      new NextRequest("http://localhost:3000/api/receipts/not-a-uuid/pdf"),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );

    expect(res.status).toBe(404);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it("returns 404 when the receipt isn't owned by the caller", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await GET(buildRequest(), params);

    expect(res.status).toBe(404);
    // Confirms we did query with both id AND user_id — the second .eq()
    // call is what enforces ownership at the SQL layer.
    expect(mocks.eqId).toHaveBeenCalledWith("id", RECEIPT_ID);
    expect(mocks.eqUser).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns 200 with application/pdf and a %PDF- byte stream when owned", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.maybeSingle.mockResolvedValue({
      data: fakeReceipt(),
      error: null,
    });

    const res = await GET(buildRequest(), params);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="unreceipt-ica-maxi-2026-05-03\.pdf"$/
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");

    const buf = await res.arrayBuffer();
    const head = new TextDecoder().decode(buf.slice(0, 5));
    expect(head).toBe("%PDF-");
    // Sanity: a real PDF has at least a few KB once fonts embed.
    expect(buf.byteLength).toBeGreaterThan(1024);
  }, 30_000);
});
