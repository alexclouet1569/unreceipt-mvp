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
  edited_at: null,
  edited_fields: null,
  edit_history: null,
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

  it("lets the user edit a verified receipt and sends only the changed fields", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: "verified" }),
    });
    const { onOpenChange } = renderDialog({ status: "verified" });

    await user.click(screen.getByRole("button", { name: /Edit receipt/i }));
    const amount = screen.getByLabelText(/^Amount/i);
    await user.clear(amount);
    await user.type(amount, "59");
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/receipts/rec-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ amount: 59 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("lets the user add the buyer and seller ids the VAT check needs", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: "verified" }),
    });
    renderDialog({ status: "verified" });

    await user.click(screen.getByRole("button", { name: /Edit receipt/i }));
    await user.type(screen.getByLabelText(/Seller org\. no\./i), "556677-8899");
    await user.type(screen.getByLabelText(/Billed to/i), "Acme AB");
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      merchant_org_number: "556677-8899",
      buyer_name: "Acme AB",
    });
  });

  it("shows the Swedish VAT check under the receipt", () => {
    renderDialog({ currency: "SEK", total: 342, tax_amount: 19.36, tax_rate: 6 });
    expect(screen.getByTestId("vat-check-panel")).toHaveTextContent(
      /May not support a VAT deduction/,
    );
  });

  it("closes the edit form without a request when nothing changed", async () => {
    const user = userEvent.setup();
    renderDialog({ status: "verified" });

    await user.click(screen.getByRole("button", { name: /Edit receipt/i }));
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Save changes/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Edit receipt/i })).toBeInTheDocument();
  });

  it("shows when and what the user edited", () => {
    renderDialog({
      status: "verified",
      edited_at: "2026-10-15T09:30:00.000Z",
      edited_fields: ["total", "merchant_name"],
    });

    expect(screen.getByTestId("receipt-edited-marker")).toHaveTextContent(
      "Edited by you on Oct 15, 2026 · Merchant, Total",
    );
  });

  it("edits VAT, payment method and line items", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: "verified" }),
    });
    renderDialog({
      status: "verified",
      total: 49,
      tax_amount: null,
      payment_method: null,
      items: [
        { label: "Kaffe", qty: 2, unit_amount: 20, total_amount: 40 },
        { label: "Bulle", qty: null, unit_amount: null, total_amount: 9 },
      ],
    });

    await user.click(screen.getByRole("button", { name: /Edit receipt/i }));
    await user.type(screen.getByLabelText(/VAT amount/i), "5.25");
    await user.type(screen.getByLabelText(/VAT rate/i), "12");
    await user.type(screen.getByLabelText(/Payment method/i), "Swish");
    // Correct the first line's amount, drop the second, add a new one.
    const firstAmount = screen.getByLabelText("Line 1 amount");
    await user.clear(firstAmount);
    await user.type(firstAmount, "38");
    await user.click(screen.getByRole("button", { name: "Remove line 2" }));
    await user.click(screen.getByRole("button", { name: /Add line/i }));
    await user.type(screen.getByLabelText("Line 2 description"), "Kanelbulle");
    await user.type(screen.getByLabelText("Line 2 amount"), "11");
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      tax_amount: 5.25,
      tax_rate: 12,
      payment_method: "Swish",
      items: [
        // Line total changed → unit price dropped so it can't contradict it.
        { label: "Kaffe", qty: 2, unit_amount: null, total_amount: 38 },
        { label: "Kanelbulle", qty: null, unit_amount: null, total_amount: 11 },
      ],
    });
  });

  it("hints when line items don't add up to the total, without blocking", async () => {
    const user = userEvent.setup();
    renderDialog({
      status: "verified",
      total: 49,
      items: [{ label: "Kaffe", qty: null, unit_amount: null, total_amount: 40 }],
    });

    await user.click(screen.getByRole("button", { name: /Edit receipt/i }));

    expect(screen.getByTestId("items-mismatch-hint")).toHaveTextContent(
      "Lines add up to €40.00; the total is €49.00.",
    );
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeEnabled();
  });

  it("refuses a line with an amount but no description", async () => {
    const user = userEvent.setup();
    renderDialog({ status: "verified" });

    await user.click(screen.getByRole("button", { name: /Edit receipt/i }));
    await user.click(screen.getByRole("button", { name: /Add line/i }));
    await user.type(screen.getByLabelText("Line 1 amount"), "10");
    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Every line needs a description",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
