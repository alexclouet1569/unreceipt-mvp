import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { GET } from "@/app/api/merchant-logo/[slug]/route";

const call = (slug: string, search = "") =>
  GET({ nextUrl: { search } } as NextRequest, { params: Promise.resolve({ slug }) });

/** A PNG header (signature + IHDR) of the given size, padded to `bytes`. */
const png = (size: number, bytes = 64) => {
  const b = new Uint8Array(Math.max(bytes, 24));
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(b.buffer);
  view.setUint32(16, size);
  view.setUint32(20, size);
  return b;
};

const iconResponse = (type: string, body: Uint8Array = png(128), status = 200) =>
  new Response(body as BodyInit, { status, headers: { "content-type": type } });

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
    fetchMock.mockResolvedValueOnce(iconResponse("image/png", png(128), 404));
    expect((await call("ica")).status).toBe(404);

    fetchMock.mockResolvedValueOnce(iconResponse("text/html"));
    expect((await call("ica")).status).toBe(404);

    fetchMock.mockResolvedValueOnce(iconResponse("image/svg+xml"));
    expect((await call("ica")).status).toBe(404);

    fetchMock.mockResolvedValueOnce(iconResponse("image/png", png(128, 300 * 1024)));
    expect((await call("ica")).status).toBe(404);

    // A PNG content type that isn't a PNG.
    fetchMock.mockResolvedValueOnce(iconResponse("image/png", new Uint8Array(64)));
    expect((await call("ica")).status).toBe(404);
  });

  it("skips icons too small to look sharp in a 48 px badge", async () => {
    fetchMock.mockResolvedValueOnce(iconResponse("image/png", png(16)));
    expect((await call("ica")).status).toBe(404);

    fetchMock.mockResolvedValueOnce(iconResponse("image/png", png(32)));
    expect((await call("ica")).status).toBe(404);

    // Not square: the short side counts.
    const wide = png(128);
    new DataView(wide.buffer).setUint32(20, 16);
    fetchMock.mockResolvedValueOnce(iconResponse("image/png", wide));
    expect((await call("ica")).status).toBe(404);

    fetchMock.mockResolvedValueOnce(iconResponse("image/png", png(64)));
    expect((await call("ica")).status).toBe(200);
  });

  it("caches a too-small icon's 404 for a week, a failure's for an hour", async () => {
    fetchMock.mockResolvedValueOnce(iconResponse("image/png", png(16)));
    expect((await call("ica")).headers.get("cache-control")).toContain("s-maxage=604800");

    fetchMock.mockResolvedValueOnce(iconResponse("text/html"));
    expect((await call("ica")).headers.get("cache-control")).toContain("s-maxage=3600");
  });

  it("rejects a truncated PNG header", async () => {
    fetchMock.mockResolvedValueOnce(iconResponse("image/png", png(128).slice(0, 20)));
    expect((await call("ica")).status).toBe(404);
  });

  it("returns 404 when the icon service is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect((await call("ica")).status).toBe(404);
  });
});
