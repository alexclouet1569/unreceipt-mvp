// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingProposalRow } from "@/lib/types";

const m = vi.hoisted(() => ({
  updateProposal: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
  getProposal: vi.fn(),
  claimForPosting: vi.fn(),
  findVoucherByMarker: vi.fn(),
  connectFile: vi.fn(async () => true),
  postVoucher: vi.fn(),
  receiptUpdate: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn() }));
vi.mock("@/components/receipt/ReceiptPdf", () => ({ ReceiptPdf: () => null }));
vi.mock("@/lib/accounting/proposals", async (orig) => ({
  ...(await orig<typeof import("@/lib/accounting/proposals")>()),
  updateProposal: m.updateProposal,
  getProposal: m.getProposal,
  claimForPosting: m.claimForPosting,
}));
vi.mock("@/lib/accounting/store", () => ({
  getConnection: async () => ({ id: "conn-1", status: "active", organization_id: "org-1" }),
  getSettings: async () => null,
  supabaseTokenStore: () => ({}),
}));
vi.mock("@/lib/accounting/tokens", async (orig) => ({
  ...(await orig<typeof import("@/lib/accounting/tokens")>()),
  getAccessToken: async () => "token",
}));
vi.mock("@/lib/accounting/fortnox/post", () => ({
  findVoucherByMarker: m.findVoucherByMarker,
  connectFile: m.connectFile,
  postVoucher: m.postVoucher,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (values: unknown) => ({
        eq: () => ({ is: async () => (m.receiptUpdate(values), { error: null }) }),
      }),
    }),
  }),
}));

import { NOT_CREATED_AFTER_MS, STALE_MS, reconcileProposal } from "@/lib/accounting/service";

const NOW = Date.parse("2026-11-20T12:00:00Z");

function row(over: Partial<BookingProposalRow>): BookingProposalRow {
  return {
    id: "p1",
    receipt_id: "r1",
    organization_id: "org-1",
    provider: "fortnox",
    status: "unknown",
    voucher: {
      transactionDate: "2026-11-12",
      description: "X · UnReceipt aaaaaaaaaaaa",
      series: "UL",
      financialYearId: 7,
      rows: [],
      totalSek: 125,
      reason: null,
    },
    source: "category",
    confidence: 0.75,
    notes: [],
    proposed_account: "6110",
    edited: false,
    approved_by: "user-1",
    approved_at: null,
    posting_started_at: null,
    marker: "UnReceipt aaaaaaaaaaaa",
    fortnox_voucher_series: null,
    fortnox_voucher_number: null,
    fortnox_financial_year: null,
    fortnox_file_id: "file-1",
    file_connected: false,
    error_code: "voucher_timeout",
    posted_at: null,
    created_at: "",
    updated_at: new Date(NOW - 2 * NOT_CREATED_AFTER_MS).toISOString(),
    ...over,
  };
}

describe("reconcileProposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds a voucher created despite the lost answer, records it and never posts again", async () => {
    m.findVoucherByMarker.mockResolvedValueOnce({ series: "UL", number: 42, year: 7 });
    await expect(reconcileProposal(row({}), NOW)).resolves.toBe("found");
    expect(m.postVoucher).not.toHaveBeenCalled();
    expect(m.connectFile).toHaveBeenCalledWith(expect.anything(), { fileId: "file-1", series: "UL", number: 42, year: 7 });
    expect(m.updateProposal).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ status: "posted", fortnox_voucher_number: 42, file_connected: true }),
    );
    expect(m.receiptUpdate).toHaveBeenCalledWith(expect.objectContaining({ booked_ref: "Fortnox UL 42" }));
  });

  it("calls it not created only once enough time has passed", async () => {
    m.findVoucherByMarker.mockResolvedValue(null);
    await expect(reconcileProposal(row({ updated_at: new Date(NOW - 60_000).toISOString() }), NOW)).resolves.toBe("wait");
    expect(m.updateProposal).not.toHaveBeenCalled();
    await expect(reconcileProposal(row({}), NOW)).resolves.toBe("not_created");
    expect(m.updateProposal).toHaveBeenCalledWith("p1", { status: "failed", error_code: "not_created" }, { fromStatus: ["unknown"] });
    expect(m.postVoucher).not.toHaveBeenCalled();
  });

  it("treats a post that died mid-way as unknown and looks it up", async () => {
    m.findVoucherByMarker.mockResolvedValueOnce(null);
    await reconcileProposal(row({ status: "posting", updated_at: new Date(NOW - STALE_MS - 1).toISOString() }), NOW);
    expect(m.updateProposal).toHaveBeenNthCalledWith(
      1,
      "p1",
      { status: "unknown", error_code: "posting_abandoned" },
      { fromStatus: ["posting"] },
    );
    expect(m.findVoucherByMarker).toHaveBeenCalled();
    expect(m.postVoucher).not.toHaveBeenCalled();
  });

  it("leaves a fresh post alone", async () => {
    await expect(reconcileProposal(row({ status: "posting", updated_at: new Date(NOW - 1000).toISOString() }), NOW)).resolves.toBe(
      "fresh",
    );
    expect(m.findVoucherByMarker).not.toHaveBeenCalled();
  });

  it("attaches a file that wasn't attached to a posted voucher", async () => {
    await expect(
      reconcileProposal(row({ status: "posted", fortnox_voucher_series: "UL", fortnox_voucher_number: 9, fortnox_financial_year: 7 }), NOW),
    ).resolves.toBe("file_attached");
    expect(m.updateProposal).toHaveBeenCalledWith("p1", { file_connected: true, error_code: null });
  });
});
