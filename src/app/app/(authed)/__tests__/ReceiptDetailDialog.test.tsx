import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Receipt } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
  remove: vi.fn(),
  deleteEq: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseClient: () => ({
    storage: {
      from: () => ({
        remove: mocks.remove,
      }),
    },
    from: () => ({
      delete: () => ({
        eq: mocks.deleteEq,
      }),
    }),
  }),
}));

import { ReceiptDetailDialog } from "@/app/app/(authed)/ReceiptDetailDialog";

const baseReceipt = (
  overrides: Partial<Receipt> = {}
): Receipt => ({
  id: "rec-1",
  transaction_id: null,
  user_id: "user-1",
  source: "captured",
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
    mocks.remove.mockReset();
    mocks.deleteEq.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("deletes the storage object first, then the row, then closes + refreshes", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ error: null });
    mocks.deleteEq.mockResolvedValue({ error: null });

    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: /Delete receipt/i }));
    await user.click(screen.getByRole("button", { name: /Confirm delete/i }));

    expect(mocks.remove).toHaveBeenCalledWith(["user-1/abc.jpg"]);
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", "rec-1");
    // Storage delete must precede row delete so a transient storage failure
    // doesn't leave the image orphaned with no row to track it back to.
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteEq.mock.invocationCallOrder[0]
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("aborts before the row delete when storage delete fails (no row delete attempted)", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({
      error: { message: "storage backend down" },
    });

    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: /Delete receipt/i }));
    await user.click(screen.getByRole("button", { name: /Confirm delete/i }));

    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Could not delete receipt/i
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("surfaces an error and leaves the row when row delete fails (image already gone)", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ error: null });
    mocks.deleteEq.mockResolvedValue({
      error: { message: "fk constraint" },
    });

    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: /Delete receipt/i }));
    await user.click(screen.getByRole("button", { name: /Confirm delete/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Could not delete receipt/i
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();

    // Retry button is enabled and labeled "Try again" — second attempt
    // succeeds (storage call is a no-op since path is already gone, which
    // Supabase treats as success).
    mocks.remove.mockResolvedValue({ error: null });
    mocks.deleteEq.mockResolvedValue({ error: null });
    await user.click(screen.getByRole("button", { name: /Try again/i }));

    expect(mocks.deleteEq).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("skips storage delete entirely for receipts without an image_url", async () => {
    const user = userEvent.setup();
    mocks.deleteEq.mockResolvedValue({ error: null });

    renderDialog({ image_url: null });

    await user.click(screen.getByRole("button", { name: /Delete receipt/i }));
    await user.click(screen.getByRole("button", { name: /Confirm delete/i }));

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", "rec-1");
  });
});
