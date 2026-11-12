import { describe, expect, it } from "vitest";
import type { MobileHome, MobileReceipt } from "@/lib/mobile/types";
import { receiptsSignature, shareHome, shareReceipts } from "../share";

const receipt = (id: string, total = 10): MobileReceipt => ({
  id,
  status: "verified",
  missing: [],
  source: "paper",
  merchant: "ICA",
  category: "meals",
  currency: "SEK",
  total,
  homeCurrency: "SEK",
  homeTotal: total,
  fxSource: "same",
  date: "2026-11-08",
  createdAt: "2026-11-08T10:00:00Z",
  original: null,
  notes: null,
  possibleDuplicate: false,
  exportedAt: null,
  bookedAt: null,
});

const home = (receipts: MobileReceipt[]): MobileHome =>
  ({ state: "ready", email: "a@b.se", access: "pilot", homeCurrency: "SEK", forwardingEmail: "x@in", receipts }) as MobileHome;

describe("shareHome", () => {
  it("returns the previous object when the server sent the same data", () => {
    const prev = home([receipt("a"), receipt("b")]);
    const next = JSON.parse(JSON.stringify(prev)) as MobileHome;
    expect(shareHome(prev, next)).toBe(prev);
  });

  it("keeps unchanged receipts as the same objects and takes the changed one", () => {
    const a = receipt("a");
    const b = receipt("b");
    const prev = home([a, b]);
    const next = home([receipt("a"), receipt("b", 99)]);
    const out = shareHome(prev, next);
    expect(out).not.toBe(prev);
    if (out.state !== "ready") throw new Error("ready");
    expect(out.receipts[0]).toBe(a);
    expect(out.receipts[1]).not.toBe(b);
    expect(out.receipts[1].total).toBe(99);
  });

  it("takes the new answer when there was none before", () => {
    const next = home([receipt("a")]);
    expect(shareHome(null, next)).toBe(next);
  });
});

describe("shareReceipts", () => {
  it("returns the previous array when nothing changed", () => {
    const prev = [receipt("a"), receipt("b")];
    expect(shareReceipts(prev, [receipt("a"), receipt("b")])).toBe(prev);
  });

  it("returns a new array when the order changed", () => {
    const a = receipt("a");
    const b = receipt("b");
    const out = shareReceipts([a, b], [receipt("b"), receipt("a")]);
    expect(out).toEqual([b, a]);
    expect(out[0]).toBe(b);
  });
});

describe("receiptsSignature", () => {
  it("changes with an amount and stays put for the same content", () => {
    const one = receiptsSignature([[receipt("a")]]);
    expect(receiptsSignature([[receipt("a")]])).toBe(one);
    expect(receiptsSignature([[receipt("a", 11)]])).not.toBe(one);
  });
});
