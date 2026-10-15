import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareImageForUpload } from "@/lib/image-resize";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prepareImageForUpload", () => {
  it("leaves PDFs untouched", async () => {
    const pdf = new File([new Uint8Array(10)], "r.pdf", { type: "application/pdf" });
    await expect(prepareImageForUpload(pdf)).resolves.toBe(pdf);
  });

  it("returns the original when the browser can't decode images (no createImageBitmap)", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const img = new File([new Uint8Array(10)], "r.jpg", { type: "image/jpeg" });
    await expect(prepareImageForUpload(img)).resolves.toBe(img);
  });

  it("returns the original when decoding throws", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode failed");
      })
    );
    const img = new File([new Uint8Array(10)], "r.heic", { type: "image/heic" });
    await expect(prepareImageForUpload(img)).resolves.toBe(img);
  });

  it("skips small images that are already within the size and edge limits", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1200, height: 1600, close }))
    );
    const img = new File([new Uint8Array(1000)], "r.jpg", { type: "image/jpeg" });

    await expect(prepareImageForUpload(img)).resolves.toBe(img);
    expect(close).toHaveBeenCalled();
  });
});
