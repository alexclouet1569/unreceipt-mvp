import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { MembersSection } from "@/app/firm/settings/MembersSection";

const fetchMock = vi.fn();
const members = [
  { id: "m-1", email: "eva@byran.se", role: "admin" as const, claimed: true },
  { id: "m-2", email: "per@byran.se", role: "staff" as const, claimed: false },
];

describe("MembersSection", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    refresh.mockReset();
  });

  it("lists people, marks who hasn't signed in, and never offers to remove yourself", () => {
    render(<MembersSection members={members} isAdmin selfId="m-1" />);
    expect(screen.getByText(/hasn't signed in yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove eva@byran.se" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove per@byran.se" })).toBeInTheDocument();
  });

  it("adds a colleague with a role", async () => {
    const user = userEvent.setup();
    render(<MembersSection members={members} isAdmin selfId="m-1" />);
    await user.type(screen.getByLabelText("Colleague's email"), "anna@byran.se");
    await user.selectOptions(screen.getByLabelText("Role"), "admin");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/firm/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "anna@byran.se", role: "admin" }),
    });
    expect(await screen.findByRole("status")).toHaveTextContent("anna@byran.se can now sign in");
    expect(refresh).toHaveBeenCalled();
  });

  it("hides the form from staff", () => {
    render(<MembersSection members={members} isAdmin={false} selfId="m-2" />);
    expect(screen.queryByLabelText("Colleague's email")).not.toBeInTheDocument();
    expect(screen.getByText(/Ask a firm admin/)).toBeInTheDocument();
  });
});
