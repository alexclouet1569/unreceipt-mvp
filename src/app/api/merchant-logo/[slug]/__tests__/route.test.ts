import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { GET } from "@/app/api/merchant-logo/[slug]/route";

const call = (slug: string, search = "") =>
  GET({ nextUrl: { search } } as NextRequest, { params: Promise.resolve({ slug }) });

const iconResponse = (type: string, bytes = 10, status = 200) =>
  new Response(new Uint8Array(bytes), { status, headers: { "content-type": type } });

describe("GET /api/merchant-logo/[slug]", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves the icon of a listed store, cached", async () => {
    fetchMock.mockResolvedValue(iconResponse("image/png"));
    const res = await call("ica");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("s-maxage=2592000");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://www.google.com/s2/favicons?domain=ica.se&sz=128",
    );
  });

  it("never fetches for a slug that isn't on the list", async () => {
    for (const slug of ["evil.example", "__proto__", "../ica", "ICA"]) {
      const res = await call(slug);
      expect(res.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a query string, which would bypass the CDN cache", async () => {
    expect((await call("ica", "?x=1")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the store has no icon or the answer isn't an image", async () => {
    fetchMock.mockResolvedValueOnce(iconResponse("image/png", 10, 404));
    expect((await call("ica")).status).toBe(404);

    fetchMock.mockResolvedValueOnce(iconResponse("text/html"));
    expect((await call("ica")).status).toBe(404);

    fetchMock.mockResolvedValueOnce(iconResponse("image/svg+xml"));
    expect((await call("ica")).status).toBe(404);

    fetchMock.mockResolvedValueOnce(iconResponse("image/png", 300 * 1024));
    expect((await call("ica")).status).toBe(404);
  });

  it("returns 404 when the icon service is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect((await call("ica")).status).toBe(404);
  });
});
