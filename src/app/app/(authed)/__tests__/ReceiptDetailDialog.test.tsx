import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Receipt } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

import { ReceiptDetailDialog } from "@/app/app/(authed)/ReceiptDetailDialog";

const baseReceipt = (
  overrides: Partial<Receipt> = {}
): Receipt => ({
  id: "rec-1",
  transaction_id: null,
  user_id: "user-1",
  source: "paper",
  merchant_name: "ICA Maxi",
  merchant_address: null,
  merchant_phone: null,
  merchant_vat_number: null,
  merchant_siret: null,
  category: "meals",
  currency: "EUR",
  notes: null,
  receipt_number: null,
  receipt_date: "2026-05-01",
  receipt_time: null,
  purchased_at: null,
  subtotal: null,
  tax_amount: null,
  tax_rate: null,
  tip_amount: null,
  total: 49,
  payment_method: null,
  card_last_four: null,
  transaction_ref: null,
  image_url: "user-1/abc.jpg",
  image_captured_at: null,
  verification_code: null,
  capture_time_seconds: null,
  ocr_confidence: null,
  is_verified: false,
  status: "verified",
  original_source_url: null,
  original_source_kind: null,
  intake_ref: null,
  parse_confidence: null,
  items: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  ...overrides,
});

const renderDialog = (overrides: Partial<Receipt> = {}) => {
  const onOpenChange = vi.fn();
  const result = render(
    <ReceiptDetailDialog
      receipt={baseReceipt(overrides)}
      onOpenChange={onOpenChange}
    />
  );
  return { onOpenChange, ...result };
};

describe("ReceiptDetailDialog (CQ2)", () => {
  beforeEach(() => {
    mocks.router.refresh.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("deletes through the server route, then closes + refreshes", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue({ ok: true, status: 200 });

    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: /Delete receipt/i }));
    await user.click(screen.getByRole("button", { name: /Confirm delete/i }));

    expect(mocks.fetch).toHaveBeenCalledWith("/api/receipts/rec-1", {
      method: "DELETE",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error and keeps the dialog open when the delete fails, then retries", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: /Delete receipt/i }));
    await user.click(screen.getByRole("button", { name: /Confirm delete/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Could not delete receipt/i
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();

    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await user.click(screen.getByRole("button", { name: /Try again/i }));

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });
});
