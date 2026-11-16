import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Receipt } from "@/lib/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { BasAccountControl } from "../BasAccountControl";

const fetchMock = vi.fn();

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    category: "transport",
    bas_account: null,
    exported_at: null,
    ...overrides,
  } as Receipt;
}

function sentBody(): unknown {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe("BasAccountControl", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    refresh.mockReset();
  });

  it("shows the category's suggestion, with Save off until something changes", () => {
    render(<BasAccountControl receipt={receipt()} />);
    expect(screen.getByLabelText("BAS account")).toHaveValue("5800");
    expect(screen.getByText(/Suggested from the category: 5800 Resekostnader/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save account" })).toBeDisabled();
  });

  it("saves the firm's own account, and only that field", async () => {
    render(<BasAccountControl receipt={receipt()} />);
    fireEvent.change(screen.getByLabelText("BAS account"), { target: { value: "5611" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/receipts/22222222-2222-4222-8222-222222222222");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("PATCH");
    expect(sentBody()).toEqual({ bas_account: "5611" });
  });

  it("stores nothing when the suggestion itself is typed back", async () => {
    render(<BasAccountControl receipt={receipt({ bas_account: "5611" })} />);
    fireEvent.change(screen.getByLabelText("BAS account"), { target: { value: "5800" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({ bas_account: null });
  });

  it("offers the suggestion back once the firm chose its own", async () => {
    render(<BasAccountControl receipt={receipt({ bas_account: "5611" })} />);
    expect(screen.getByLabelText("BAS account")).toHaveValue("5611");
    expect(screen.getByText(/Your choice\. The category would suggest 5800/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use the suggestion" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({ bas_account: null });
  });

  it("refuses an account that isn't 4 digits, without calling the server", () => {
    render(<BasAccountControl receipt={receipt()} />);
    // Letters are dropped as they're typed.
    fireEvent.change(screen.getByLabelText("BAS account"), { target: { value: "56a" } });
    expect(screen.getByLabelText("BAS account")).toHaveValue("56");
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));

    expect(screen.getByRole("alert")).toHaveTextContent("A BAS account has 4 digits.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when the save failed", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    render(<BasAccountControl receipt={receipt()} />);
    fireEvent.change(screen.getByLabelText("BAS account"), { target: { value: "5611" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the account");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("explains how to get the new account into a file once the receipt was exported", () => {
    render(
      <BasAccountControl receipt={receipt({ bas_account: "5611", exported_at: "2026-11-02T10:00:00Z" })} />
    );
    expect(screen.getByText(/already exported/)).toBeInTheDocument();
  });
});
