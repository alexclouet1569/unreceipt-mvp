import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api-error";
import { afterUnauthorized, type Refreshed } from "../auth-retry";

const res = (status: number) => ({ status }) as Response;

function steps(over: { refresh?: Refreshed; resend?: number; keep?: (r: Response) => boolean } = {}) {
  return {
    keep401: vi.fn(async (r: Response) => over.keep?.(r) ?? false),
    refresh: vi.fn(async () => over.refresh ?? ({ kind: "token", accessToken: "new" } as Refreshed)),
    resend: vi.fn(async (_token: string) => res(over.resend ?? 200)),
  };
}

const kindOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "resolved";
  } catch (err) {
    return err instanceof ApiError ? err.kind : "other";
  }
};

describe("a 401 from the server", () => {
  it("passes any other answer through without refreshing", async () => {
    const s = steps();
    expect((await afterUnauthorized(res(500), s)).status).toBe(500);
    expect(s.refresh).not.toHaveBeenCalled();
  });

  it("refreshes the token once and resends", async () => {
    const s = steps();
    expect((await afterUnauthorized(res(401), s)).status).toBe(200);
    expect(s.resend).toHaveBeenCalledWith("new");
  });

  it("signs out only when the refresh itself is refused", async () => {
    expect(await kindOf(afterUnauthorized(res(401), steps({ refresh: { kind: "signedOut" } })))).toBe("unauthorized");
  });

  it("is offline when the refresh couldn't reach the server", async () => {
    expect(await kindOf(afterUnauthorized(res(401), steps({ refresh: { kind: "offline" } })))).toBe("offline");
  });

  it("is a server error, never a sign-out, when a refresh worked and the resend is still 401", async () => {
    expect(await kindOf(afterUnauthorized(res(401), steps({ resend: 401 })))).toBe("server");
  });

  it("hands back a 401 the caller reads itself, before and after a refresh", async () => {
    const first = steps({ keep: () => true });
    expect((await afterUnauthorized(res(401), first)).status).toBe(401);
    expect(first.refresh).not.toHaveBeenCalled();

    let calls = 0;
    const second = steps({ resend: 401, keep: () => calls++ > 0 });
    expect((await afterUnauthorized(res(401), second)).status).toBe(401);
    expect(second.refresh).toHaveBeenCalledOnce();
  });
});
