import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  getNativeApp: vi.fn(),
  isPilotMode: vi.fn(),
  loadBillingAccount: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/native-app-server", () => ({ getNativeApp: mocks.getNativeApp }));
vi.mock("@/lib/pilot", () => ({ isPilotMode: mocks.isPilotMode }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/stripe-billing", () => ({ loadBillingAccount: mocks.loadBillingAccount }));
vi.mock("../SubscribeButton", () => ({
  SubscribeButton: ({ trial }: { trial?: boolean }) => (
    <button data-trial={String(trial)}>Subscribe</button>
  ),
}));
vi.mock("@/app/app/(authed)/settings/ManageBillingButton", () => ({
  ManageBillingButton: () => <button>Manage billing</button>,
}));

import SubscribePage from "../page";

const IOS = { platform: "ios", version: "1.0.0" };

async function renderPage() {
  render(await SubscribePage({ searchParams: Promise.resolve({}) }));
}

describe("/subscribe", () => {
  beforeEach(() => {
    mocks.getServerUser.mockResolvedValue({ id: "u1", email: "anna@example.se" });
    mocks.getNativeApp.mockResolvedValue(null);
    mocks.isPilotMode.mockReturnValue(false);
    mocks.loadBillingAccount.mockResolvedValue({
      customerId: null,
      hasLiveSubscription: false,
      hadSubscription: false,
    });
  });
  afterEach(() => cleanup());

  it("shows plans and the subscribe button in a browser", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    expect(screen.getByText(/First week free/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscribe" })).toHaveAttribute("data-trial", "true");
  });

  it("with a running subscription: Manage billing instead of a second purchase", async () => {
    mocks.loadBillingAccount.mockResolvedValue({
      customerId: "cus_1",
      hasLiveSubscription: true,
      hadSubscription: true,
    });
    await renderPage();
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
    expect(screen.getByText(/You already have a plan/)).toBeInTheDocument();
  });

  it("a returning customer gets no second free week", async () => {
    mocks.loadBillingAccount.mockResolvedValue({
      customerId: "cus_1",
      hasLiveSubscription: false,
      hadSubscription: true,
    });
    await renderPage();
    expect(screen.getByRole("button", { name: "Subscribe" })).toHaveAttribute("data-trial", "false");
    expect(screen.queryByText(/First week free/)).not.toBeInTheDocument();
  });

  it("still shows the plans when the billing lookup fails", async () => {
    mocks.loadBillingAccount.mockRejectedValue(new Error("db down"));
    await renderPage();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
  });

  it("in the store app: no button, price, trial or link out when the account has no plan", async () => {
    mocks.getNativeApp.mockResolvedValue(IOS);
    await renderPage();

    expect(screen.getByRole("heading", { name: /This account isn.t active/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/€|kr|free week|First week|subscribe|unreceipt\.com|website/i);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/app/settings"]);
  });

  it("in the store app during the pilot: straight on to the receipts, with no price", async () => {
    mocks.getNativeApp.mockResolvedValue(IOS);
    mocks.isPilotMode.mockReturnValue(true);
    await renderPage();

    expect(screen.getByRole("link", { name: /Continue to your receipts/ })).toHaveAttribute("href", "/app");
    expect(document.body.textContent).not.toMatch(/€|plans start/i);
  });
});
