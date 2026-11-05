import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Receipt } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { bucketOf, FirmReceiptList } from "@/app/firm/clients/[orgId]/FirmReceiptList";

const base: Receipt = {
  id: "r-1",
  transaction_id: null,
  user_id: "owner-1",
  source: "email",
  merchant_name: "ICA Maxi",
  merchant_address: null,
  merchant_phone: null,
  merchant_vat_number: null,
  merchant_siret: null,
  category: "meals",
  currency: "SEK",
  notes: null,
  receipt_number: null,
  receipt_date: "2026-11-02",
  receipt_time: null,
  purchased_at: "2026-11-02T12:00:00Z",
  subtotal: null,
  tax_amount: null,
  tax_rate: null,
  tip_amount: null,
  total: 120,
  payment_method: null,
  card_last_four: null,
  transaction_ref: null,
  image_url: null,
  image_captured_at: null,
  status: "verified",
  verification_code: null,
  capture_time_seconds: null,
  ocr_confidence: null,
  is_verified: false,
  original_source_url: "owner-1/x.eml",
  original_source_kind: "eml",
  intake_ref: null,
  parse_confidence: null,
  items: null,
  edited_at: null,
  edited_fields: null,
  edit_history: null,
  organization_id: "org-1",
  seller_org_number: null,
  vat_lines: null,
  bas_account: null,
  exported_at: null,
  exported_by: null,
  booked_at: null,
  booked_by: null,
  booked_ref: null,
  created_at: "2026-11-02T12:00:00Z",
  updated_at: "2026-11-02T12:00:00Z",
};

const receipts: Receipt[] = [
  base,
  { ...base, id: "r-2", merchant_name: "Uber", status: "pending_review" },
  { ...base, id: "r-3", merchant_name: "Coop", exported_at: "2026-11-05T00:00:00Z" },
];

afterEach(cleanup);

describe("FirmReceiptList", () => {
  it("buckets receipts", () => {
    expect(bucketOf(receipts[0])).toBe("ready");
    expect(bucketOf(receipts[1])).toBe("review");
    expect(bucketOf(receipts[2])).toBe("exported");
  });

  it("shows counts per chip and filters the list", async () => {
    const user = userEvent.setup();
    render(<FirmReceiptList receipts={receipts} />);
    expect(screen.getByRole("tab", { name: /All\s*3/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Review needed\s*1/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBe(3);

    await user.click(screen.getByRole("tab", { name: /Exported\s*1/ }));
    expect(screen.getByText("Coop")).toBeInTheDocument();
    expect(screen.queryByText("Uber")).not.toBeInTheDocument();
  });

  it("opens the firm variant of the detail dialog: no delete button", async () => {
    const user = userEvent.setup();
    render(<FirmReceiptList receipts={receipts} />);
    await user.click(screen.getByText("ICA Maxi"));
    expect(await screen.findByTestId("receipt-download-link")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete receipt/i })).not.toBeInTheDocument();
  });
});

describe("FirmReceiptList booking", () => {
  it("offers 'Mark as booked' on a ready receipt and posts to the client's booking route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, updated: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FirmReceiptList receipts={receipts} />);
    await user.click(screen.getByText("ICA Maxi"));
    await user.type(await screen.findByLabelText("Verification reference (optional)"), "A 7");
    await user.click(screen.getByRole("button", { name: /Mark as booked/ }));
    expect(fetchMock).toHaveBeenCalledWith("/api/firm/clients/org-1/receipts/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receiptIds: ["r-1"], ref: "A 7", booked: true }),
    });
    vi.unstubAllGlobals();
  });
});
