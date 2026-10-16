import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/supabase-client", () => ({
  getSupabaseClient: () => ({ auth: { signOut: mocks.signOut } }),
}));

import { SignOutButton } from "@/app/app/(authed)/settings/SignOutButton";

const res = (ok: boolean) => ({ ok }) as unknown as Response;

describe("SignOutButton", () => {
  const realLocation = window.location;

  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.signOut.mockReset();
    mocks.replace.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, replace: mocks.replace },
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("signs out and reloads the login page", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /Sign out/i }));

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/app/login");
  });

  it("clears the cookies server-side when Supabase sign-out fails", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("network") });
    mocks.fetch.mockResolvedValue(res(true));
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /Sign out/i }));

    expect(mocks.fetch).toHaveBeenCalledWith("/api/auth/clear", { method: "POST" });
    expect(mocks.replace).toHaveBeenCalledWith("/app/login");
  });

  it("stays put and says so when the cookies couldn't be cleared", async () => {
    mocks.signOut.mockRejectedValue(new Error("network"));
    mocks.fetch.mockResolvedValue(res(false));
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /Sign out/i }));

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn.t sign you out/i);
    expect(screen.getByRole("button", { name: /Sign out/i })).toBeEnabled();
  });
});
