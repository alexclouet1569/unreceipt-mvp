import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/supabase-client", () => ({
  getSupabaseClient: () => ({ auth: { signOut: mocks.signOut } }),
}));

import { DeleteAccountSection } from "@/app/app/(authed)/settings/DeleteAccountSection";

const res = (status: number, body: unknown) =>
  ({ ok: status < 300, status, json: async () => body }) as unknown as Response;

describe("DeleteAccountSection", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const openAndConfirm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: /Delete account/i }));
    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByLabelText(/Type DELETE/i), "DELETE");
  };

  it("only enables deletion after the download check and the typed word", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountSection />);

    await user.click(screen.getByRole("button", { name: /Delete account/i }));
    const confirm = screen.getByRole("button", { name: /^Delete account$/ });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/Type DELETE/i), "DELETE");
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("posts the confirmation to the server", async () => {
    const user = userEvent.setup();
    // Keep the request pending so the test doesn't navigate.
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    render(<DeleteAccountSection />);

    await openAndConfirm(user);
    await user.click(screen.getByRole("button", { name: /^Delete account$/ }));

    expect(mocks.fetch).toHaveBeenCalledWith("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    expect(screen.getByRole("button", { name: /Deleting/ })).toBeDisabled();
  });

  it("asks the user to sign in again when the session isn't fresh", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(res(401, { error: "reauth_required" }));
    render(<DeleteAccountSection />);

    await openAndConfirm(user);
    await user.click(screen.getByRole("button", { name: /^Delete account$/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/sign in again/i);
    expect(screen.getByRole("button", { name: /Sign in again/i })).toBeInTheDocument();
  });

  it("shows a readable error when deletion fails", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(res(500, { error: "x" }));
    render(<DeleteAccountSection />);

    await openAndConfirm(user);
    await user.click(screen.getByRole("button", { name: /^Delete account$/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn't delete your account/,
    );
  });

  it("firm variant: asks about the firm instead of a download, then posts the same confirmation", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    const notice = "You're the only person in Bokföring AB, so deleting your account also closes the firm.";
    render(<DeleteAccountSection variant="firm" firmNotice={notice} />);

    await user.click(screen.getByRole("button", { name: /Delete account/i }));
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.queryByText(/Download your data first/)).not.toBeInTheDocument();
    expect(screen.getByText(/Your clients.* receipts are theirs/)).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: /^Delete account$/ });
    await user.type(screen.getByLabelText(/Type DELETE/i), "DELETE");
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /what happens to my firm/ }));
    await user.click(confirm);

    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/account/delete",
      expect.objectContaining({ body: JSON.stringify({ confirm: "DELETE" }) }),
    );
  });

  it("company variant tells an accountant-with-a-company what happens to the firm", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountSection firmNotice="You'll leave Bokföring AB." />);
    await user.click(screen.getByRole("button", { name: /Delete account/i }));
    expect(screen.getByText("You'll leave Bokföring AB.")).toBeInTheDocument();
    expect(screen.getByText(/Download your data first/)).toBeInTheDocument();
  });
});
