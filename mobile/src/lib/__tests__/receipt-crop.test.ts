import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ module: null as null | { cropReceipt: ReturnType<typeof vi.fn> } }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => native.module }));

async function load() {
  vi.resetModules();
  return import("../../../modules/receipt-crop");
}

describe("cropReceipt", () => {
  beforeEach(() => {
    native.module = null;
  });

  it("keeps the photo as taken on a build without the module (an over-the-air update)", async () => {
    const { cropReceipt } = await load();
    expect(await cropReceipt("file:///shot.jpg")).toEqual({ uri: "file:///shot.jpg", cropped: false });
  });

  it("uses the crop when the module made one", async () => {
    native.module = { cropReceipt: vi.fn(async () => ({ uri: "file:///crop.jpg", cropped: true })) };
    const { cropReceipt } = await load();
    expect(await cropReceipt("file:///shot.jpg")).toEqual({ uri: "file:///crop.jpg", cropped: true });
  });

  it("never fails a scan: an error or an empty answer gives the photo back", async () => {
    native.module = { cropReceipt: vi.fn(async () => { throw new Error("vision"); }) };
    let { cropReceipt } = await load();
    expect(await cropReceipt("file:///shot.jpg")).toEqual({ uri: "file:///shot.jpg", cropped: false });

    native.module = { cropReceipt: vi.fn(async () => ({ uri: "", cropped: true })) };
    ({ cropReceipt } = await load());
    expect(await cropReceipt("file:///shot.jpg")).toEqual({ uri: "file:///shot.jpg", cropped: false });
  });
});
