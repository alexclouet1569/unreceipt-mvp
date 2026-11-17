// Invite and join links opened signed out (Step 5 of the demo-funnel plan):
// the emails say "You'll create a free account first", so the pages open
// the login on Create account and keep the invite in ?next= to come back
// to after confirming. /app/firm-join stays on Sign in (no email links
// there; firm staff are told to sign in).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  rateLimit: vi.fn(),
  loadJoinFirmName: vi.fn(),
  loadJoinTarget: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, clientIpFrom: () => "203.0.113.9" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/firm/join-link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firm/join-link")>()),
  loadJoinFirmName: mocks.loadJoinFirmName,
  loadJoinTarget: mocks.loadJoinTarget,
}));

import AcceptInvitePage from "@/app/app/accountant/accept/page";
import FirmRequestPage from "@/app/app/firm-request/page";
import TeamJoinPage from "@/app/app/team-join/page";
import FirmJoinPage from "@/app/app/firm-join/page";
import ConnectPage from "@/app/app/connect/[code]/page";

const CODE = "AbCdEfGhIjKlMnOpQrStUv";

function loginTarget(err: unknown) {
  const message = (err as Error).message;
  expect(message.startsWith("redirect:")).toBe(true);
  return new URL(message.slice("redirect:".length), "https://app.unreceipt.com");
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getServerUser.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("signed-out invite and join pages", () => {
  it.each([
    ["accountant invite", () => AcceptInvitePage({ searchParams: Promise.resolve({ token: "tok_123" }) }), "/app/accountant/accept?token=tok_123"],
    ["client's request to its accountant", () => FirmRequestPage({ searchParams: Promise.resolve({ token: "tok_123" }) }), "/app/firm-request?token=tok_123"],
    ["team invite", () => TeamJoinPage(), "/app/team-join"],
  ])("%s opens Create account and comes back to the invite", async (_name, page, next) => {
    const url = loginTarget(await page().catch((e: unknown) => e));
    expect(url.pathname).toBe("/app/login");
    expect(url.searchParams.get("mode")).toBe("signup");
    expect(url.searchParams.get("next")).toBe(next);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("firm seat opens Sign in", async () => {
    const url = loginTarget(await FirmJoinPage().catch((e: unknown) => e));
    expect(url.searchParams.get("mode")).toBeNull();
    expect(url.searchParams.get("next")).toBe("/app/firm-join");
  });

  it("firm's join link says what UnReceipt is, names the firm and offers both ways in", async () => {
    mocks.loadJoinFirmName.mockResolvedValue("Bergström Redovisning AB");
    render(await ConnectPage({ params: Promise.resolve({ code: CODE }) }));
    expect(
      screen.getByRole("heading", { name: "Share your receipts with Bergström Redovisning AB?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/keeps your company's receipts in one place/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is shared until you sign in and press Yes, share/)).toBeInTheDocument();
    const signup = new URL(screen.getByRole("link", { name: "Create account" }).getAttribute("href")!, "https://x");
    expect(signup.pathname).toBe("/app/login");
    expect(signup.searchParams.get("mode")).toBe("signup");
    expect(signup.searchParams.get("next")).toBe(`/app/connect/${CODE}`);
    const signin = new URL(screen.getByRole("link", { name: "I already have an account" }).getAttribute("href")!, "https://x");
    expect(signin.searchParams.get("mode")).toBeNull();
    expect(signin.searchParams.get("next")).toBe(`/app/connect/${CODE}`);
    // Signed out, only the name is read: never who runs the firm.
    expect(mocks.loadJoinTarget).not.toHaveBeenCalled();
    expect(mocks.rateLimit).toHaveBeenCalledWith("connectView", "203.0.113.9");
  });

  it("reads nothing for a code that can't be one", async () => {
    render(await ConnectPage({ params: Promise.resolve({ code: "nope" }) }));
    expect(screen.getByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.loadJoinFirmName).not.toHaveBeenCalled();
  });

  it("says a turned-off link doesn't work", async () => {
    mocks.loadJoinFirmName.mockResolvedValue(null);
    render(await ConnectPage({ params: Promise.resolve({ code: CODE }) }));
    expect(screen.getByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
  });

  it("names nobody over the per-IP limit, and still lets the visitor in", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
    render(await ConnectPage({ params: Promise.resolve({ code: CODE }) }));
    expect(screen.getByRole("heading", { name: "Share your receipts with your accountant?" })).toBeInTheDocument();
    expect(mocks.loadJoinFirmName).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Create account" })).toBeInTheDocument();
  });
});

describe("the client shell's signed-out bounce", () => {
  it("leaves the join page and the login alone, and bounces everything else", async () => {
    const { worksSignedOut } = await import("@/app/app/_client-shell");
    expect(worksSignedOut(`/app/connect/${CODE}`)).toBe(true);
    expect(worksSignedOut("/app/login")).toBe(true);
    for (const path of ["/app", "/app/settings", "/app/connect", "/app/connected", "/app/team-join", null]) {
      expect(worksSignedOut(path)).toBe(false);
    }
  });
});
