// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(),
  sendEmail: vi.fn(),
  getOrCreateAliasForUser: vi.fn(),
  getFirmMembership: vi.fn(),
  findPendingFirmSeat: vi.fn(),
  hasAnyMembership: vi.fn(),
}));

vi.mock("@/lib/require-firm", () => ({
  getFirmMembership: mocks.getFirmMembership,
  findPendingFirmSeat: mocks.findPendingFirmSeat,
}));
vi.mock("@/lib/organizations", () => ({ hasAnyMembership: mocks.hasAnyMembership }));

// update(...).eq(...).is(...).select(...) → claim; update(...).eq(...) → release
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (patch: { welcome_email_sent_at: string | null }) => ({
        eq: () =>
          patch.welcome_email_sent_at === null
            ? mocks.release()
            : { is: () => ({ select: () => mocks.claim() }) },
      }),
    }),
  }),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: mocks.sendEmail,
  founderReplyTo: () => "founder@example.com",
}));

vi.mock("@/lib/email-alias", () => ({
  getOrCreateAliasForUser: mocks.getOrCreateAliasForUser,
  buildForwardingAddress: (hash: string) => `receipts+${hash}@in.unreceipt.com`,
}));

import { sendWelcomeEmailOnce } from "@/lib/welcome-email";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alex@example.se",
  user_metadata: { full_name: "Alex Andersson" },
};

describe("sendWelcomeEmailOnce", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.PILOT_MODE = "true";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.unreceipt.com";
    delete process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    mocks.claim.mockReset().mockResolvedValue({ data: [{ user_id: USER.id }], error: null });
    mocks.release.mockReset().mockResolvedValue({ error: null });
    mocks.sendEmail.mockReset().mockResolvedValue({ ok: true, id: "email_1" });
    mocks.getOrCreateAliasForUser.mockReset().mockResolvedValue("abc123");
    mocks.getFirmMembership.mockReset().mockResolvedValue(null);
    mocks.findPendingFirmSeat.mockReset().mockResolvedValue(null);
    mocks.hasAnyMembership.mockReset().mockResolvedValue(true);
  });

  it("skips the customer welcome for firm staff, or a pending seat, without a company", async () => {
    mocks.hasAnyMembership.mockResolvedValue(false);
    mocks.getFirmMembership.mockResolvedValue({ firmId: "f1", firmName: "Byrån", memberId: "m1", role: "admin" });
    await expect(sendWelcomeEmailOnce(USER)).resolves.toBe("skipped");
    mocks.getFirmMembership.mockResolvedValue(null);
    mocks.findPendingFirmSeat.mockResolvedValue({ firmName: "Byrån" });
    await expect(sendWelcomeEmailOnce(USER)).resolves.toBe("skipped");
    // Nothing claimed: a later sign-in can still send it if they start a company.
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.getOrCreateAliasForUser).not.toHaveBeenCalled();
  });

  it("still welcomes firm staff who also have a company of their own", async () => {
    mocks.getFirmMembership.mockResolvedValue({ firmId: "f1", firmName: "Byrån", memberId: "m1", role: "staff" });
    mocks.hasAnyMembership.mockResolvedValue(true);
    await expect(sendWelcomeEmailOnce(USER)).resolves.toBe("sent");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("claims the row, then sends the pilot welcome email to the user", async () => {
    await expect(sendWelcomeEmailOnce(USER)).resolves.toBe("sent");

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const email = mocks.sendEmail.mock.calls[0][0];
    expect(email.to).toBe("alex@example.se");
    expect(email.subject).toBe("Welcome to the UnReceipt pilot");
    expect(email.replyTo).toBe("founder@example.com");
    expect(email.tag).toBe("pilot_welcome");
    expect(email.html).toContain("Hey Alex");
    expect(email.html).toContain("https://app.unreceipt.com/app");
  });

  it("sends nothing when the email already went out (claim matched no row)", async () => {
    mocks.claim.mockResolvedValue({ data: [], error: null });

    await expect(sendWelcomeEmailOnce(USER)).resolves.toBe("already_sent");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("releases the claim when Resend refuses, so the next sign-in retries", async () => {
    mocks.sendEmail.mockResolvedValue({ ok: false, reason: "rejected", status: 422 });

    await expect(sendWelcomeEmailOnce(USER)).resolves.toBe("failed");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("does not promise email forwarding until the inbound webhook is configured", async () => {
    await sendWelcomeEmailOnce(USER);
    expect(mocks.getOrCreateAliasForUser).not.toHaveBeenCalled();
    expect(mocks.sendEmail.mock.calls[0][0].text).not.toMatch(/forward/i);
  });

  it("includes the user's forwarding address once inbound email is live", async () => {
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = "whsec_test";

    await sendWelcomeEmailOnce(USER);

    expect(mocks.sendEmail.mock.calls[0][0].text).toContain(
      "receipts+abc123@in.unreceipt.com"
    );
  });

  it("skips quietly without a Resend key or an email address", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendWelcomeEmailOnce(USER)).resolves.toBe("skipped");

    process.env.RESEND_API_KEY = "re_test";
    await expect(sendWelcomeEmailOnce({ ...USER, email: null })).resolves.toBe("skipped");
    expect(mocks.claim).not.toHaveBeenCalled();
  });
});
