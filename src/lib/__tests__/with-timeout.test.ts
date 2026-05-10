import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "@/lib/with-timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resolves with the wrapped value when it settles before the deadline", async () => {
    const value = await withTimeout("ok", 1_000, Promise.resolve(42));
    expect(value).toBe(42);
  });

  it("rejects with TimeoutError when the wrapped promise hangs", async () => {
    vi.useFakeTimers();
    const hung = new Promise<number>(() => {});
    const racing = withTimeout("hung-step", 5_000, hung);
    // Pre-attach a handler so the rejection (when fake timers fire it) is
    // never observed as "unhandled" by node, even momentarily.
    const captured = racing.catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(5_000);

    const err = await captured;
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err).toMatchObject({ label: "hung-step", ms: 5_000 });
  });

  it("propagates rejection from the wrapped promise unchanged", async () => {
    const original = new Error("downstream boom");
    await expect(
      withTimeout("fail", 1_000, Promise.reject(original))
    ).rejects.toBe(original);
  });
});
