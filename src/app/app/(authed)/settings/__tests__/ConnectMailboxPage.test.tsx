import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  providers: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/app/app/(authed)/settings/mailboxes/load", () => ({
  loadMailboxProviders: mocks.providers,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

import ConnectMailboxPage from "@/app/app/(authed)/settings/mailboxes/connect/page";

const renderPage = async (provider: string | undefined, reconnect?: string) =>
  render(await ConnectMailboxPage({ searchParams: Promise.resolve({ provider, reconnect }) }));

describe("/app/settings/mailboxes/connect", () => {
  beforeEach(() => {
    mocks.getServerUser.mockResolvedValue({ id: "u1", email: "anna@example.se" });
    mocks.providers.mockReturnValue({ google: true, microsoft: true });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("explains what we read, then continues to Google with a plain link", async () => {
    vi.stubEnv("GOOGLE_OAUTH_VERIFIED", "");
    await renderPage("google");
    expect(screen.getByRole("heading", { level: 1, name: "Connect Gmail" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "To spot receipts, UnReceipt checks the sender, subject and attachment names of new emails. Only receipts and invoices are opened and saved in your account, with the email as the original. Other emails are never opened or saved. We also pick up receipts from the last 30 days. UnReceipt can’t send, change or delete anything in your mailbox. Disconnect any time in Settings.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Google will ask to let UnReceipt read your email/)).toBeInTheDocument();
    const warning = screen.getByTestId("google-unverified");
    expect(warning).toHaveTextContent(
      "Google checks new apps before removing a warning, and ours is still being checked. You’ll see ‘Google hasn’t verified this app’. Tap Advanced, then Go to UnReceipt (unsafe). It doesn’t change what UnReceipt can see.",
    );
    // Google's button names in bold, so they're easy to find on its screen.
    expect([...warning.querySelectorAll("strong")].map((el) => el.textContent)).toEqual([
      "Advanced",
      "Go to UnReceipt (unsafe)",
    ]);
    const go = screen.getByRole("link", { name: "Continue to Google" });
    expect(go).toHaveAttribute("href", "/api/mailboxes/connect/google");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/app/settings");
  });

  it("lays out like the other Settings steps: the way back, then the title, no mint mark", async () => {
    const { container } = await renderPage("google");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/app/settings");
    expect(container.innerHTML).not.toContain("--brand-tint");
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass("text-center");
  });

  it("says Reconnect when it comes from a mailbox's Reconnect", async () => {
    await renderPage("google", "1");
    expect(screen.getByRole("heading", { level: 1, name: "Reconnect Gmail" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to Google" })).toHaveAttribute(
      "href",
      "/api/mailboxes/connect/google",
    );
  });

  it("drops the unverified warning once Google has verified the app", async () => {
    vi.stubEnv("GOOGLE_OAUTH_VERIFIED", "true");
    await renderPage("google");
    expect(screen.queryByTestId("google-unverified")).toBeNull();
  });

  it("has a Microsoft variant without Google's warning", async () => {
    vi.stubEnv("GOOGLE_OAUTH_VERIFIED", "");
    await renderPage("microsoft");
    expect(screen.getByRole("heading", { name: "Connect Outlook" })).toBeInTheDocument();
    expect(screen.getByText(/Microsoft will ask to let UnReceipt read your email/)).toBeInTheDocument();
    expect(screen.queryByTestId("google-unverified")).toBeNull();
    expect(screen.getByRole("link", { name: "Continue to Microsoft" })).toHaveAttribute(
      "href",
      "/api/mailboxes/connect/microsoft",
    );
  });

  it("sends an unknown or unconfigured provider back to Settings", async () => {
    await expect(renderPage("yahoo")).rejects.toThrow("redirect:/app/settings");
    await expect(renderPage(undefined)).rejects.toThrow("redirect:/app/settings");
    mocks.providers.mockReturnValue({ google: false, microsoft: true });
    await expect(renderPage("google")).rejects.toThrow("redirect:/app/settings");
  });

  it("asks a signed-out visitor to sign in", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    await expect(renderPage("google")).rejects.toThrow("redirect:/app/login?next=/app/settings");
  });
});
