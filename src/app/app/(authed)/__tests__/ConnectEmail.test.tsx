import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
  fetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import { Dashboard } from "@/app/app/(authed)/dashboard";
import type { MailboxProviders } from "@/app/app/(authed)/settings/mailboxes/copy";

const BOTH: MailboxProviders = { google: true, microsoft: true };

const renderDashboard = (
  props: { showOnboarding?: boolean; mailboxProviders?: MailboxProviders; connectedMailboxes?: string[] } = {},
) =>
  render(
    <Dashboard
      userEmail="owner@example.se"
      receipts={[]}
      forwardingEmail="receipts+abc@in.unreceipt.com"
      intakeSmsNumber={null}
      {...props}
    />,
  );

describe("Connect your email: first run and empty inbox", () => {
  beforeEach(() => {
    mocks.fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("step 1 leads with Connect your email when a provider is set up", async () => {
    const user = userEvent.setup();
    renderDashboard({ showOnboarding: true, mailboxProviders: BOTH });

    expect(screen.getByRole("heading", { name: "Connect your email" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Connect Gmail or Outlook and receipts in your inbox arrive here by themselves, ready to check.",
      ),
    ).toBeInTheDocument();
    // Connect leads, so the guide link offers forwarding as the other way.
    expect(screen.getByRole("link", { name: "Set up forwarding instead, step by step" })).toHaveAttribute(
      "href",
      "/app/settings/forwarding",
    );
    expect(screen.getByRole("link", { name: "Connect Gmail" })).toHaveAttribute(
      "href",
      "/app/settings/mailboxes/connect?provider=google",
    );
    expect(screen.getByRole("link", { name: "Connect Outlook" })).toHaveAttribute(
      "href",
      "/app/settings/mailboxes/connect?provider=microsoft",
    );
    // Forwarding stays as the second way in.
    expect(screen.getByText("Or forward receipts to")).toBeInTheDocument();
    expect(screen.getByText("receipts+abc@in.unreceipt.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByText("Snap your first receipt")).toBeInTheDocument();
  });

  it("step 1 shows only the configured provider", () => {
    renderDashboard({ showOnboarding: true, mailboxProviders: { google: false, microsoft: true } });
    expect(screen.queryByRole("link", { name: "Connect Gmail" })).toBeNull();
    expect(screen.getByRole("link", { name: "Connect Outlook" })).toBeInTheDocument();
    expect(screen.getByText(/^Connect Outlook and receipts in your inbox/)).toBeInTheDocument();
  });

  it("step 1 says the email is connected once it is", () => {
    renderDashboard({ showOnboarding: true, mailboxProviders: BOTH, connectedMailboxes: ["anna@gmail.com"] });
    expect(screen.getByRole("heading", { name: "Your email is connected" })).toBeInTheDocument();
    expect(screen.getByText(/anna@gmail.com/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Connect/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("step 1 is today's address screen without a provider", () => {
    renderDashboard({ showOnboarding: true });
    expect(screen.getByRole("heading", { name: "Your private receipts address" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Connect/ })).toBeNull();
    expect(screen.getByText("Forward email receipts to")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make it automatic, step by step (3 min)" })).toBeInTheDocument();
  });

  it("the empty inbox offers to connect, forwarding second", () => {
    renderDashboard({ mailboxProviders: BOTH });
    expect(screen.getByText("Your inbox is empty")).toBeInTheDocument();
    expect(screen.getByText(/Connect your email and receipts arrive by themselves/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Gmail" })).toBeInTheDocument();
    expect(screen.getByText("Or forward receipts to")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up forwarding instead, step by step" })).toBeInTheDocument();
  });

  it("the empty inbox says which mailbox is being watched", () => {
    renderDashboard({ mailboxProviders: BOTH, connectedMailboxes: ["anna@gmail.com"] });
    expect(screen.getByText(/Checking anna@gmail.com for new receipts/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make it automatic, step by step (3 min)" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Connect/ })).toBeNull();
  });

  it("the empty inbox is unchanged without a provider (the demo tour too)", () => {
    renderDashboard();
    expect(screen.queryByRole("link", { name: /Connect/ })).toBeNull();
    expect(screen.getByText("Forward email receipts to")).toBeInTheDocument();
    expect(screen.getByText(/snap a paper one/)).toBeInTheDocument();
  });
});
