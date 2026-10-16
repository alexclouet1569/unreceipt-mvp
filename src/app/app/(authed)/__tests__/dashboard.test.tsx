import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Receipt } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import { Dashboard } from "@/app/app/(authed)/dashboard";

const receipt = (over: Partial<Receipt>): Receipt => ({
  id: "r",
  transaction_id: null,
  user_id: "u1",
  source: "paper",
  merchant_name: "Shop",
  merchant_address: null,
  merchant_phone: null,
  merchant_vat_number: null,
  merchant_siret: null,
  category: "other",
  currency: "SEK",
  notes: null,
  receipt_number: null,
  receipt_date: "2026-10-01",
  receipt_time: null,
  purchased_at: null,
  subtotal: null,
  tax_amount: null,
  tax_rate: null,
  tip_amount: null,
  total: 100,
  payment_method: null,
  card_last_four: null,
  transaction_ref: null,
  image_url: null,
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
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
  ...over,
});

const RECEIPTS = [
  receipt({ id: "a", merchant_name: "Kafé Ett", category: "meals", total: 120 }),
  receipt({ id: "b", merchant_name: "Kafé Två", category: "meals", total: 80 }),
  receipt({ id: "c", merchant_name: "Tåg Tre", category: "travel", total: 895 }),
  receipt({ id: "d", merchant_name: "Bistro Fyra", category: "meals", currency: "EUR", total: 18.5 }),
];

const renderDashboard = () =>
  render(
    <Dashboard
      userEmail="owner@example.se"
      receipts={RECEIPTS}
      forwardingEmail="receipts+abc@in.unreceipt.com"
      intakeSmsNumber={null}
    />,
  );

describe("Dashboard grouping and filters", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("groups by category, most used first, with a count and total per currency", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(screen.getByRole("button", { name: "By date" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "By category" }));

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Meals & dining· 3200.00 kr + €18.50",
      "Travel· 1895.00 kr",
    ]);
  });

  it("filters to one category from its chip, and back to all on a second tap", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const chips = screen.getByRole("group", { name: "Filter receipts" });

    await user.click(within(chips).getByRole("button", { name: /Travel/ }));
    expect(screen.getByText("Tåg Tre")).toBeInTheDocument();
    expect(screen.queryByText("Kafé Ett")).toBeNull();

    expect(within(chips).getByRole("button", { name: /Travel/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(chips).getByRole("button", { name: /Travel/ }));
    expect(screen.getByText("Kafé Ett")).toBeInTheDocument();
  });
});
