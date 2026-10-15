import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportPanel, exportPeriods, recentMonths } from "@/components/ExportPanel";

const fetchMock = vi.fn();
const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe("ExportPanel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists the last 13 months newest first", () => {
    const months = recentMonths(new Date("2026-01-15T00:00:00Z"));
    expect(months).toHaveLength(13);
    expect(months[0]).toBe("2026-01");
    expect(months[1]).toBe("2025-12");
    expect(months[12]).toBe("2025-01");
  });

  it("reaches back to the first receipt, with whole years too", () => {
    const { months, years } = exportPeriods(
      new Date("2026-10-15T00:00:00Z"),
      "2023-03-04T12:00:00Z",
    );
    expect(months[0]).toBe("2026-10");
    expect(months.at(-1)).toBe("2023-03");
    expect(years).toEqual(["2026", "2025", "2024", "2023"]);
    // New accounts still get the last 13 months.
    expect(exportPeriods(new Date("2026-10-15T00:00:00Z"), null).months).toHaveLength(13);
  });

  it("exports the chosen month and shows the download links", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      ok({
        receiptCount: 2,
        parts: [{ filename: "unreceipt-2026-10.zip", url: "https://signed/a", bytes: 2_500_000 }],
      }),
    );
    render(<ExportPanel />);

    await user.selectOptions(screen.getByLabelText("Period"), "all");
    await user.click(screen.getByRole("button", { name: /Create export/i }));

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      period: "all",
    });
    const link = await screen.findByRole("link", { name: /unreceipt-2026-10.zip/ });
    expect(link).toHaveAttribute("href", "https://signed/a");
    expect(screen.getByRole("status")).toHaveTextContent("2 receipts ready.");
  });

  it("says so when the period has no receipts", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(ok({ receiptCount: 0, parts: [] }));
    render(<ExportPanel fixedPeriod="all" />);

    await user.click(screen.getByRole("button", { name: /Download all receipts/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("No receipts in this period.");
  });
});
