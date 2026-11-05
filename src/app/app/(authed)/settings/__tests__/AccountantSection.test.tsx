import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AccountantSection } from "@/app/app/(authed)/settings/AccountantSection";

const fetchMock = vi.fn();

describe("AccountantSection", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    refresh.mockReset();
  });

  it("explains the empty state", () => {
    render(<AccountantSection links={[]} />);
    expect(screen.getByText(/No accountant yet/)).toBeInTheDocument();
  });

  it("accepts a pending invite through the respond route", async () => {
    const user = userEvent.setup();
    render(<AccountantSection links={[{ id: "inv-1", firmName: "Byrån AB", status: "invited", since: null }]} />);
    await user.click(screen.getByRole("button", { name: "Share your receipts with Byrån AB" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/accountant/respond", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteId: "inv-1", action: "accept" }),
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("disconnects an active firm through the link route", async () => {
    const user = userEvent.setup();
    render(<AccountantSection links={[{ id: "link-1", firmName: "Byrån AB", status: "active", since: "3 Nov 2026" }]} />);
    expect(screen.getByText(/Sees your receipts since 3 Nov 2026/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop sharing with Byrån AB" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/accountant/link", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ linkId: "link-1" }),
    });
  });

  it("shows the server's error", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Your company is already connected to another accounting firm." }) });
    render(<AccountantSection links={[{ id: "inv-1", firmName: "Byrån AB", status: "invited", since: null }]} />);
    await user.click(screen.getByRole("button", { name: "Share your receipts with Byrån AB" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already connected");
  });
});
