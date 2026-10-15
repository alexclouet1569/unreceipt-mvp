import { afterEach, describe, expect, it, vi } from "vitest";
import { isHeicLike, prepareImageForUpload } from "@/lib/image-resize";

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

  it("re-encodes a small HEIC to JPEG when the browser can decode it (Safari)", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1200, height: 1600, close }))
    );
    const drawImage = vi.fn();
    const jpeg = new Blob([new Uint8Array(2000)], { type: "image/jpeg" });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag !== "canvas") return realCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (cb: (b: Blob | null) => void) => cb(jpeg),
      } as unknown as HTMLCanvasElement;
    });
    // Smaller than the JPEG it becomes: still converted, because the
    // server doesn't accept HEIC.
    const heic = new File([new Uint8Array(1000)], "IMG_0001.HEIC", { type: "image/heic" });

    const out = await prepareImageForUpload(heic);

    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_0001.jpg");
    expect(drawImage).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("isHeicLike", () => {
  it("recognises HEIC/HEIF by type, or by extension when the type is empty", () => {
    expect(isHeicLike({ type: "image/heic", name: "a.jpg" })).toBe(true);
    expect(isHeicLike({ type: "image/heif", name: "a" })).toBe(true);
    expect(isHeicLike({ type: "", name: "IMG_1.HEIC" })).toBe(true);
    expect(isHeicLike({ type: "image/jpeg", name: "a.jpg" })).toBe(false);
    expect(isHeicLike({ type: "", name: "notes.txt" })).toBe(false);
  });
});
