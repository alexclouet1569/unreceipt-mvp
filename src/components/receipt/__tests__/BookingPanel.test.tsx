import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { BookingPanel } from "../BookingPanel";

const ID = "22222222-2222-4222-8222-222222222222";
const fetchMock = vi.fn();

const PROPOSAL = {
  id: "p1",
  status: "proposed",
  updatedAt: "2026-11-20T10:00:00.000Z",
  transactionDate: "2026-11-12",
  description: "Clas Ohlson · UnReceipt 222222222222",
  series: "UL",
  rows: [
    { account: "6110", name: "Kontorsmateriel", debit: 100, credit: 0 },
    { account: "2640", name: "Ingående moms", debit: 25, credit: 0 },
    { account: "1930", name: "Företagskonto", debit: 0, credit: 125 },
  ],
  totalSek: 125,
  source: "category",
  confidence: 0.75,
  notes: [],
  reason: null,
  debitAccount: "6110",
  edited: false,
  errorCode: null,
  voucherRef: null,
  fileConnected: false,
  postedAt: null,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("BookingPanel", () => {
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    refresh.mockReset();
  });

  it("renders nothing without a Fortnox connection or when the route fails", async () => {
    fetchMock.mockResolvedValueOnce(json({ kind: "not_connected", canConnect: true }));
    const { container, unmount } = render(<BookingPanel receiptId={ID} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(container.querySelector("[data-testid=booking-panel]")).toBeNull();
    unmount();

    fetchMock.mockResolvedValueOnce(json({ error: "no_original" }, 404));
    const second = render(<BookingPanel receiptId={ID} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(second.container.querySelector("[data-testid=booking-panel]")).toBeNull();
  });

  it("shows the proposed voucher and approves it with the chosen account", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        kind: "proposal",
        proposal: PROPOSAL,
        canApprove: true,
        accounts: [
          { number: "6110", name: "Kontorsmateriel" },
          { number: "5410", name: "Förbrukningsinventarier" },
        ],
      }),
    );
    render(<BookingPanel receiptId={ID} />);
    expect(await screen.findByText("Proposed voucher")).toBeTruthy();
    expect(screen.getByText("125.00 kr")).toBeTruthy();

    fireEvent.change(screen.getByTestId("booking-account"), { target: { value: "5410" } });
    fetchMock.mockResolvedValueOnce(json({ proposal: { ...PROPOSAL, status: "posted", voucherRef: "UL 42" } }));
    fireEvent.click(screen.getByTestId("booking-approve"));

    expect(await screen.findByText(/Booked in Fortnox · UL 42/)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`/api/receipts/${ID}/booking`);
    expect(JSON.parse(init.body as string)).toEqual({ account: "5410", expectedUpdatedAt: PROPOSAL.updatedAt });
    expect(refresh).toHaveBeenCalled();
  });

  it("explains what stands in the way to someone who may approve", async () => {
    fetchMock.mockResolvedValueOnce(json({ kind: "blocked", blocks: ["period_locked"], canApprove: true }));
    render(<BookingPanel receiptId={ID} />);
    expect(await screen.findByText("The date is in a locked period in Fortnox.")).toBeTruthy();
  });

  it("offers no approval to someone who only looks", async () => {
    fetchMock.mockResolvedValueOnce(json({ kind: "proposal", proposal: PROPOSAL, canApprove: false, accounts: [] }));
    render(<BookingPanel receiptId={ID} />);
    expect(await screen.findByText("Proposed voucher")).toBeTruthy();
    expect(screen.queryByTestId("booking-approve")).toBeNull();
  });
});
