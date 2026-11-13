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
    // Forwarding is the "Send us receipts" section right below: no second
    // link to the same guide here, just where to look.
    expect(screen.queryByRole("link", { name: /Forward/ })).toBeNull();
    expect(screen.getByText(/Other email, like iCloud or Yahoo: forward it to the address below/)).toBeInTheDocument();
  });

  it("hides a provider that isn't configured", () => {
    render(<MailboxesSection providers={{ google: false, microsoft: true }} connections={[]} limit={5} />);
    expect(screen.queryByRole("link", { name: "Connect Gmail" })).toBeNull();
    expect(screen.getByRole("link", { name: "Connect Outlook" })).toBeInTheDocument();
  });

  it("with no provider configured offers nothing to connect", () => {
    render(<MailboxesSection providers={NONE} connections={[]} limit={5} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByText(/iCloud/)).toBeNull();
  });

  it("lists each mailbox with its status in plain words", () => {
    render(
      <MailboxesSection
        providers={BOTH}
        limit={6}
        connections={[
          conn(),
          conn({ id: "2", provider: "microsoft", email: "anna@outlook.com", status: "needs_reconnect" }),
          conn({ id: "3", email: "new@gmail.com", lastSyncAt: null, lastReceiptAt: null }),
          conn({ id: "4", email: "quiet@gmail.com", lastReceiptAt: null }),
          conn({ id: "5", email: "paused@gmail.com", status: "paused" }),
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
    expect(rows[4]).toHaveTextContent("Paused: your account doesn’t have access right now, so new email isn’t read.");

    // Reconnect only where it's needed, through the explainer.
    expect(within(rows[1]).getByRole("link", { name: "Reconnect anna@outlook.com" })).toHaveAttribute(
      "href",
      "/app/settings/mailboxes/connect?provider=microsoft&reconnect=1",
    );
    expect(within(rows[0]).queryByRole("link", { name: /Reconnect/ })).toBeNull();
    expect(within(rows[4]).queryByRole("link", { name: /Reconnect/ })).toBeNull();

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

  it("in the store app, a mailbox needing reconnection says where to do it", () => {
    render(
      <MailboxesSection
        providers={NONE}
        limit={5}
        storeApp
        connections={[conn({ status: "needs_reconnect" })]}
      />,
    );
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Reconnect on app.unreceipt.com in your browser.");
    expect(within(row).queryByRole("link")).toBeNull();
    expect(within(row).getByRole("button", { name: "Disconnect anna@gmail.com" })).toBeInTheDocument();
  });

  it("keeps the red for the confirm step", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<MailboxesSection providers={BOTH} connections={[conn()]} limit={5} />);
    const disconnect = screen.getByRole("button", { name: "Disconnect anna@gmail.com" });
    expect(disconnect.className).not.toMatch(/--negative|bg-destructive|text-destructive/);
    await user.click(disconnect);
    expect(screen.getByRole("button", { name: "Confirm: disconnect anna@gmail.com" }).className).toMatch(
      /bg-destructive/,
    );
  });

  it("disconnects after a confirm step, then refreshes", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<MailboxesSection providers={BOTH} connections={[conn()]} limit={5} />);

    await user.click(screen.getByRole("button", { name: "Disconnect anna@gmail.com" }));
    expect(fetchMock).not.toHaveBeenCalled();
    // Focus lands on the question, never on the destructive button.
    const question = screen.getByText(/Receipts already saved stay/);
    expect(question).toHaveFocus();

    // Cancel goes back without calling anything, focus on that row's Disconnect.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Disconnect anna@gmail.com" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Disconnect anna@gmail.com" }));
    await user.click(screen.getByRole("button", { name: "Confirm: disconnect anna@gmail.com" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/mailboxes/11111111-1111-4111-8111-111111111111", {
      method: "DELETE",
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("list", { name: "Connected mailboxes" })).toBeNull();
    // Announced, and focus isn't lost with the row.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Disconnected anna@gmail.com");
    expect(status).toHaveFocus();
  });

  it("after an Outlook disconnect, says where to remove access at Microsoft", async () => {
    vi.useRealTimers();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, revoked: false }) });
    const user = userEvent.setup();
    render(
      <MailboxesSection
        providers={BOTH}
        connections={[conn({ provider: "microsoft", email: "anna@outlook.com" })]}
        limit={5}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Disconnect anna@outlook.com" }));
    await user.click(screen.getByRole("button", { name: "Confirm: disconnect anna@outlook.com" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Disconnected anna@outlook.com");
    expect(status).toHaveTextContent(
      "To remove UnReceipt’s access completely, also remove it in your Microsoft account (account.microsoft.com → Privacy → Apps; work: myapps.microsoft.com).",
    );
  });

  it("after a Google disconnect whose revoke failed, points to Google's permissions page; not after one that worked", async () => {
    vi.useRealTimers();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, revoked: false }) });
    const user = userEvent.setup();
    render(
      <MailboxesSection
        providers={BOTH}
        connections={[conn(), conn({ id: "2", email: "work@gmail.com" })]}
        limit={5}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Disconnect anna@gmail.com" }));
    await user.click(screen.getByRole("button", { name: "Confirm: disconnect anna@gmail.com" }));
    expect(await screen.findByRole("status")).toHaveTextContent("myaccount.google.com/permissions");

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, revoked: true }) });
    await user.click(screen.getByRole("button", { name: "Disconnect work@gmail.com" }));
    await user.click(screen.getByRole("button", { name: "Confirm: disconnect work@gmail.com" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Disconnected work@gmail.com");
    expect(status).not.toHaveTextContent("myaccount.google.com");
  });

  it("returns focus to the right row's Disconnect after Cancel", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(
      <MailboxesSection
        providers={BOTH}
        limit={5}
        connections={[conn(), conn({ id: "2", email: "work@gmail.com" })]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Disconnect work@gmail.com" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Disconnect work@gmail.com" })).toHaveFocus();
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
