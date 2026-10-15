// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  syncProfile: vi.fn(),
  scheduleWelcomeEmail: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/profile-sync", () => ({ syncProfile: mocks.syncProfile }));
vi.mock("@/lib/welcome-email", () => ({ scheduleWelcomeEmail: mocks.scheduleWelcomeEmail }));

import { POST } from "@/app/api/auth/finish/route";

const req = (origin?: string) =>
  new NextRequest("https://app.unreceipt.com/api/auth/finish", {
    method: "POST",
    headers: { host: "app.unreceipt.com", ...(origin ? { origin } : {}) },
  });

const USER = {
  id: "u1",
  email: "alex@acme.se",
  email_confirmed_at: "2026-10-15T20:00:00Z",
  user_metadata: { full_name: "Alex" },
};

describe("POST /api/auth/finish", () => {
  beforeEach(() => {
    mocks.getServerUser.mockReset();
    mocks.syncProfile.mockReset();
    mocks.scheduleWelcomeEmail.mockReset();
  });

  it("syncs the profile and queues the welcome email for the signed-in user", async () => {
    mocks.getServerUser.mockResolvedValue(USER);
    const res = await POST(req("https://app.unreceipt.com"));
    expect(res.status).toBe(200);
    expect(mocks.syncProfile).toHaveBeenCalledWith("u1", { full_name: "Alex" });
    expect(mocks.scheduleWelcomeEmail).toHaveBeenCalledWith(USER);
  });

  it("never emails an address that isn't confirmed", async () => {
    mocks.getServerUser.mockResolvedValue({ ...USER, email_confirmed_at: null });
    const res = await POST(req("https://app.unreceipt.com"));
    expect(res.status).toBe(200);
    expect(mocks.syncProfile).toHaveBeenCalled();
    expect(mocks.scheduleWelcomeEmail).not.toHaveBeenCalled();
  });

  it("refuses cross-site requests", async () => {
    const res = await POST(req("https://evil.example"));
    expect(res.status).toBe(403);
    expect(mocks.getServerUser).not.toHaveBeenCalled();
  });

  it("refuses anonymous callers", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    const res = await POST(req("https://app.unreceipt.com"));
    expect(res.status).toBe(401);
    expect(mocks.syncProfile).not.toHaveBeenCalled();
  });

  it("still answers ok when the profile write fails", async () => {
    mocks.getServerUser.mockResolvedValue(USER);
    mocks.syncProfile.mockRejectedValue(new Error("db down"));
    const res = await POST(req());
    expect(res.status).toBe(200);
  });
});
