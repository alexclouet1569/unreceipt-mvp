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
  organization_id: null,
  seller_org_number: null,
  vat_lines: null,
  bas_account: null,
  exported_at: null,
  exported_by: null,
  booked_at: null,
  booked_by: null,
  booked_ref: null,
  home_currency: null,
  home_total: null,
  fx_rate: null,
  fx_date: null,
  fx_source: null,
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
    // The PDF "prepare" request the dialog sends on open is answered here,
    // so the tests only see the calls they're about.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      String(url).endsWith("/pdf?prepare=1")
        ? Promise.resolve({ ok: true, status: 204 } as Response)
        : mocks.fetch(url, init),
    );
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

  it("marks only the empty fields, in red, and unmarks them once filled", async () => {
    const user = userEvent.setup();
    renderDialog({ status: "pending_review", total: null, receipt_date: null, merchant_name: "Parking" });

    expect(screen.getByTestId("review-reason")).toHaveTextContent("Missing: amount and date.");
    const amount = screen.getByLabelText(/Amount · Missing/);
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/Date · Missing/)).toHaveAttribute("aria-invalid", "true");
    // The merchant is there: not marked.
    expect(screen.getByLabelText("Merchant")).not.toHaveAttribute("aria-invalid");
    // No honey background on the whole panel any more.
    expect(screen.getByRole("form", { name: "Complete receipt" })).not.toHaveStyle({ background: "var(--attention-tint)" });

    await user.type(amount, "60");
    expect(screen.getByTestId("review-reason")).toHaveTextContent("Missing: date.");
    expect(screen.getByLabelText("Amount")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Complete receipt" })).toBeInTheDocument();
  });

  it("says nothing is missing when a complete receipt only waits for a confirmation", () => {
    renderDialog({ status: "pending_review", parse_confidence: 0.7 });

    expect(screen.getByTestId("review-reason")).toHaveTextContent("Nothing is missing.");
    expect(screen.queryByText(/· Missing/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm receipt" })).toBeInTheDocument();
  });
});
