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

const renderPage = async (provider: string | undefined) =>
  render(await ConnectMailboxPage({ searchParams: Promise.resolve({ provider }) }));

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
    expect(screen.getByRole("heading", { name: "Connect Gmail" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "UnReceipt looks only at emails that look like receipts or invoices, and saves only those. Everything else is never read into UnReceipt or stored. You can disconnect any time.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Google will ask to let UnReceipt read your email/)).toBeInTheDocument();
    expect(screen.getByTestId("google-unverified")).toHaveTextContent(
      "Google may show a warning that the app isn’t verified yet: choose Advanced → Continue.",
    );
    const go = screen.getByRole("link", { name: "Continue to Google" });
    expect(go).toHaveAttribute("href", "/api/mailboxes/connect/google");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/app/settings");
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
