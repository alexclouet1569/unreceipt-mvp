import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { MailboxesSection } from "@/app/app/(authed)/settings/mailboxes/MailboxesSection";
import type { MailboxView } from "@/app/app/(authed)/settings/mailboxes/copy";

const BOTH = { google: true, microsoft: true };
const NONE = { google: false, microsoft: false };
const NOW = Date.parse("2026-11-13T12:00:00Z");

function conn(over: Partial<MailboxView> = {}): MailboxView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    provider: "google",
    email: "anna@gmail.com",
    status: "active",
    lastReceiptAt: "2026-11-13T10:00:00Z",
    lastSyncAt: "2026-11-13T11:55:00Z",
    createdAt: "2026-11-01T09:00:00Z",
    ...over,
  };
}

const fetchMock = vi.fn();

describe("MailboxesSection", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    refresh.mockReset();
  });

  it("offers one button per configured provider, linking to the explainer", () => {
    render(<MailboxesSection providers={BOTH} connections={[]} limit={5} />);
    expect(screen.getByRole("link", { name: "Connect Gmail" })).toHaveAttribute(
      "href",
      "/app/settings/mailboxes/connect?provider=google",
    );
    expect(screen.getByRole("link", { name: "Connect Outlook" })).toHaveAttribute(
      "href",
      "/app/settings/mailboxes/connect?provider=microsoft",
    );
    expect(screen.queryByText("Add another mailbox")).toBeNull();
    expect(screen.getByRole("link", { name: /Other email \(iCloud, Yahoo…\)\? Forward instead/ })).toHaveAttribute(
      "href",
      "/app/settings/forwarding",
    );
  });

  it("hides a provider that isn't configured", () => {
    render(<MailboxesSection providers={{ google: false, microsoft: true }} connections={[]} limit={5} />);
    expect(screen.queryByRole("link", { name: "Connect Gmail" })).toBeNull();
    expect(screen.getByRole("link", { name: "Connect Outlook" })).toBeInTheDocument();
  });

  it("with no provider configured shows only the forwarding option", () => {
    render(<MailboxesSection providers={NONE} connections={[]} limit={5} />);
    expect(screen.queryByRole("link", { name: /Connect/ })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/app/settings/forwarding");
  });

  it("lists each mailbox with its status in plain words", () => {
    render(
      <MailboxesSection
        providers={BOTH}
        limit={5}
        connections={[
          conn(),
          conn({ id: "2", provider: "microsoft", email: "anna@outlook.com", status: "needs_reconnect" }),
          conn({ id: "3", email: "new@gmail.com", lastSyncAt: null, lastReceiptAt: null }),
          conn({ id: "4", email: "quiet@gmail.com", lastReceiptAt: null }),
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Connected mailboxes" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("anna@gmail.com");
    expect(rows[0]).toHaveTextContent("Gmail · Watching for receipts · last receipt 2 h ago");
    expect(rows[1]).toHaveTextContent("Outlook · Reconnect needed");
    expect(rows[2]).toHaveTextContent("Setting up…");
    expect(rows[3]).toHaveTextContent("Watching for receipts · none yet");

    // Reconnect only where it's needed, straight to the connect route.
    expect(within(rows[1]).getByRole("link", { name: "Reconnect anna@outlook.com" })).toHaveAttribute(
      "href",
      "/api/mailboxes/connect/microsoft",
    );
    expect(within(rows[0]).queryByRole("link", { name: /Reconnect/ })).toBeNull();

    expect(screen.getByText("Add another mailbox")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Gmail" })).toBeInTheDocument();
  });

  it("hides the connect buttons at the limit", () => {
    const five = Array.from({ length: 5 }, (_, i) => conn({ id: String(i), email: `a${i}@gmail.com` }));
    render(<MailboxesSection providers={BOTH} connections={five} limit={5} />);
    expect(screen.queryByRole("link", { name: /Connect/ })).toBeNull();
    expect(screen.queryByText("Add another mailbox")).toBeNull();
    expect(screen.getByText(/5 mailboxes is the most you can connect/)).toBeInTheDocument();
  });

  it("disconnects after a confirm step, then refreshes", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<MailboxesSection providers={BOTH} connections={[conn()]} limit={5} />);

    await user.click(screen.getByRole("button", { name: "Disconnect anna@gmail.com" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Receipts already saved stay/)).toBeInTheDocument();

    // Cancel goes back without calling anything.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Disconnect anna@gmail.com" }));
    await user.click(screen.getByRole("button", { name: "Confirm: disconnect anna@gmail.com" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/mailboxes/11111111-1111-4111-8111-111111111111", {
      method: "DELETE",
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText("anna@gmail.com")).toBeNull();
  });

  it("keeps the mailbox and says so when the disconnect fails", async () => {
    vi.useRealTimers();
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "server_error" }) });
    const user = userEvent.setup();
    render(<MailboxesSection providers={BOTH} connections={[conn()]} limit={5} />);

    await user.click(screen.getByRole("button", { name: "Disconnect anna@gmail.com" }));
    await user.click(screen.getByRole("button", { name: "Confirm: disconnect anna@gmail.com" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t disconnect anna@gmail.com");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getAllByText("anna@gmail.com").length).toBeGreaterThan(0);
  });

  it("says when the list couldn't be read", () => {
    render(<MailboxesSection providers={BOTH} connections={[]} limit={5} failed />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your connected mailboxes");
  });
});
