import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

describe("Dashboard period total", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const at7Nov = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0)); // 7 November 2026, local time
  };
  const renderWith = (receipts: Receipt[], homeCurrency = "SEK") =>
    render(
      <Dashboard
        userEmail="owner@example.se"
        receipts={receipts}
        forwardingEmail="receipts+abc@in.unreceipt.com"
        intakeSmsNumber={null}
        homeCurrency={homeCurrency}
      />,
    );
  // The card is the select's parent; its text is the amount plus the label.
  const totalCard = () => screen.getByRole("combobox", { name: /Total for period/ }).parentElement!;

  const OCT = receipt({ id: "oct", total: 1217, currency: "SEK", purchased_at: "2026-10-14T12:00:00Z", receipt_date: "2026-10-14" });
  const NOV = receipt({ id: "nov", total: 245, currency: "SEK", purchased_at: null, receipt_date: "2026-11-03" });
  const LAST_YEAR = receipt({ id: "old", total: 100, currency: "SEK", purchased_at: null, receipt_date: "2025-12-20" });

  it("starts on this month, named, in the company's currency", () => {
    at7Nov();
    renderWith([OCT], "EUR");
    expect(totalCard().textContent).toMatch(/November/);
    // October's receipt isn't this month's.
    expect(totalCard().textContent).toMatch(/€0/);
    expect(totalCard().textContent).not.toMatch(/1[ ,.]?217/);
  });

  it("offers this month, every month with a receipt (newest first) and all time", () => {
    at7Nov();
    renderWith([OCT, NOV, LAST_YEAR]);
    const options = within(screen.getByRole("combobox", { name: /Total for period/ }))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["November", "October", "December 2025", "All time"]);
  });

  it("keeps another year's label short on the card and big totals readable", async () => {
    at7Nov();
    renderWith([receipt({ id: "big", total: 123456.78, currency: "SEK", purchased_at: null, receipt_date: "2025-12-20" })]);
    const select = screen.getByRole("combobox", { name: /Total for period/ });
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).selectOptions(select, "2025-12");
    expect(totalCard().textContent).toMatch(/Dec 2025/);
    // A long amount steps down a size instead of being cut off.
    const amount = within(totalCard()).getByText(/123/);
    expect(amount.className).toMatch(/text-\[12px\]/);
    // VoiceOver reads the total with the picker.
    expect(select.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("shows the total for the month or for all time that the user picks", async () => {
    at7Nov();
    renderWith([OCT, NOV, LAST_YEAR]);
    const select = screen.getByRole("combobox", { name: /Total for period/ });
    expect(totalCard().textContent).toMatch(/245/);

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).selectOptions(select, "2026-10");
    expect(totalCard().textContent).toMatch(/1[ ,.]?217/);
    expect(totalCard().textContent).toMatch(/October/);

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).selectOptions(select, "all");
    expect(totalCard().textContent).toMatch(/1[ ,.]?562/);
    expect(totalCard().textContent).toMatch(/All time/);
  });
});

describe("Dashboard swipe to delete", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    mocks.router.refresh.mockReset();
  });

  const swipeOpen = (merchant: string) => {
    const row = screen.getByText(merchant).closest('[data-testid="swipe-row"]') as Element;
    for (const [type, x] of [["pointerDown", 300], ["pointerMove", 240], ["pointerMove", 170], ["pointerUp", 170]] as const) {
      fireEvent[type](row, { pointerId: 1, pointerType: "touch", clientX: x, clientY: 100 });
    }
    return document.querySelector(`button[aria-label^="Delete receipt: ${merchant}"]`) as HTMLButtonElement;
  };

  const flush = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
  };

  it("removes the receipt at once, offers Undo, then deletes it on the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();

    fireEvent.click(swipeOpen("Tåg Tre"));

    expect(screen.queryByText("Tåg Tre")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Deleted Tåg Tre");
    expect(fetchMock).not.toHaveBeenCalled();

    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/receipts/c", { method: "DELETE", keepalive: true });
    expect(mocks.router.refresh).toHaveBeenCalled();
  });

  it("brings the receipt back on Undo and never deletes it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();

    fireEvent.click(swipeOpen("Tåg Tre"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByText("Tåg Tre")).toBeInTheDocument();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes right away when the app goes to the background", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();

    fireEvent.click(swipeOpen("Tåg Tre"));
    fireEvent(window, new Event("pagehide"));

    expect(fetchMock).toHaveBeenCalledWith("/api/receipts/c", { method: "DELETE", keepalive: true });
  });

  it("brings the receipt back and says so when the delete fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderDashboard();

    fireEvent.click(swipeOpen("Tåg Tre"));
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't delete Tåg Tre");
    expect(screen.getByText("Tåg Tre")).toBeInTheDocument();
  });
});
