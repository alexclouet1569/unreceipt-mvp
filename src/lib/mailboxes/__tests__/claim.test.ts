// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));

import { CLAIM_WINDOW_SECONDS, MAX_INGEST_RETRIES, RETRY_WINDOW_SECONDS, allowIngestRetry, claimMessage } from "../claim";

beforeEach(() => mocks.rpc.mockReset());

describe("claimMessage", () => {
  it("claims once per window under a hashed key (no message id stored)", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await claimMessage("conn-1", "18c0ffee")).toBe(true);
    expect(await claimMessage("conn-1", "18c0ffee")).toBe(false);
    const [fn, args] = mocks.rpc.mock.calls[0];
    expect(fn).toBe("rate_limit_hit");
    expect(args).toMatchObject({ p_window_seconds: CLAIM_WINDOW_SECONDS, p_limit: 1 });
    expect(args.p_key).toMatch(/^mailboxMsg:300:[0-9a-f]{40}$/);
    expect(args.p_key).not.toContain("18c0ffee");
    // Same key for the same message, another for another connection.
    expect(mocks.rpc.mock.calls[1][1].p_key).toBe(args.p_key);
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await claimMessage("conn-2", "18c0ffee");
    expect(mocks.rpc.mock.calls[2][1].p_key).not.toBe(args.p_key);
  });

  it("fails open", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42883" } });
    expect(await claimMessage("c", "m")).toBe(true);
    mocks.rpc.mockRejectedValueOnce(new Error("network"));
    expect(await claimMessage("c", "m")).toBe(true);
  });
});

describe("allowIngestRetry", () => {
  it("allows MAX_INGEST_RETRIES retries per message under a hashed key, then says skip", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    expect(await allowIngestRetry("conn-1", "18c0ffee")).toBe(true);
    expect(await allowIngestRetry("conn-1", "18c0ffee")).toBe(false);
    const [fn, args] = mocks.rpc.mock.calls[0];
    expect(fn).toBe("rate_limit_hit");
    expect(args).toMatchObject({ p_window_seconds: RETRY_WINDOW_SECONDS, p_limit: MAX_INGEST_RETRIES });
    expect(args.p_key).toMatch(new RegExp(`^mailboxRetry:${RETRY_WINDOW_SECONDS}:[0-9a-f]{40}$`));
    expect(args.p_key).not.toContain("18c0ffee");
  });

  it("keeps retrying when the counter fails (never drops a receipt on a blip)", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42883" } });
    expect(await allowIngestRetry("c", "m")).toBe(true);
    mocks.rpc.mockRejectedValueOnce(new Error("network"));
    expect(await allowIngestRetry("c", "m")).toBe(true);
  });
});
