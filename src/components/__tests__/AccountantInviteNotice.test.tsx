import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountantInviteNotice } from "@/components/AccountantInviteNotice";

const fetchMock = vi.fn();

describe("AccountantInviteNotice", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders nothing without invites", () => {
    const { container } = render(<AccountantInviteNotice invites={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shares the receipts without a link token and confirms in place", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: "active" }) });
    const user = userEvent.setup();
    render(<AccountantInviteNotice invites={[{ id: "inv-1", firmName: "Byrån AB" }]} />);
    expect(screen.getByRole("heading", { name: "Byrån AB wants to see your receipts" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, share my receipts" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/accountant/respond", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteId: "inv-1", action: "accept" }),
    });
    expect(screen.getByRole("status")).toHaveTextContent("Done. Byrån AB now gets your receipts automatically.");
    // On the receipts page there is no "Go to your receipts" link.
    expect(screen.queryByRole("link", { name: "Go to your receipts" })).not.toBeInTheDocument();
  });

  it("turns an expired or used invite into a plain sentence", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "not_found" }) });
    const user = userEvent.setup();
    render(<AccountantInviteNotice invites={[{ id: "inv-1", firmName: "Byrån AB" }]} />);
    await user.click(screen.getByRole("button", { name: "No thanks" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This invite isn't valid any more");
  });
});
