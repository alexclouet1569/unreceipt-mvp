import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dismissAll, EMPTY_SEEN, markOpened, parseSeen, startSeen, unseen } from "../new-receipts";

const A = { id: "a", createdAt: "2026-11-14T10:00:00.000Z" };
const B = { id: "b", createdAt: "2026-11-14T10:05:00.000Z" };
const C = { id: "c", createdAt: "2026-11-14T10:09:00.000Z" };

describe("new receipts notice state", () => {
  it("counts everything that exists on the first answer as seen", () => {
    expect(startSeen(EMPTY_SEEN, A.createdAt)).toEqual({ after: A.createdAt, opened: [] });
    const seen = { after: A.createdAt, opened: [] };
    expect(startSeen(seen, C.createdAt)).toBe(seen);
    expect(startSeen(EMPTY_SEEN, null)).toBe(EMPTY_SEEN);
  });

  it("shows what came after the cursor and wasn't opened", () => {
    const seen = { after: A.createdAt, opened: ["b"] };
    expect(unseen([C, B, A], seen)).toEqual([C]);
  });

  it("opening one keeps the rest; opening the last moves the cursor past them all", () => {
    const start = { after: A.createdAt, opened: [] };
    const one = markOpened(start, [C, B], "c");
    expect(one).toEqual({ after: A.createdAt, opened: ["c"] });
    expect(unseen([C, B], one)).toEqual([B]);
    const both = markOpened(one, [C, B], "b");
    expect(both).toEqual({ after: C.createdAt, opened: [] });
    expect(unseen([C, B], both)).toEqual([]);
  });

  it("dismissing counts every shown receipt as seen, never moving the cursor back", () => {
    expect(dismissAll({ after: A.createdAt, opened: ["b"] }, [C, B])).toEqual({ after: C.createdAt, opened: [] });
    const later = { after: "2026-11-15T00:00:00.000Z", opened: [] };
    expect(dismissAll(later, [C])).toEqual(later);
    expect(dismissAll(later, [])).toBe(later);
  });

  it("reads back only a well-formed stored value", () => {
    expect(parseSeen(JSON.stringify({ after: A.createdAt, opened: ["x", 3] }))).toEqual({ after: A.createdAt, opened: ["x"] });
    expect(parseSeen("not json")).toEqual(EMPTY_SEEN);
    expect(parseSeen(null)).toEqual(EMPTY_SEEN);
    expect(parseSeen(JSON.stringify({ after: "yesterday" }))).toEqual(EMPTY_SEEN);
  });

  it("the iPhone app's copy is the same code", () => {
    const body = (file: string) => {
      const text = readFileSync(path.resolve(__dirname, file), "utf8");
      return text.slice(text.indexOf("export type SeenState"));
    };
    expect(body("../../../../mobile/src/lib/newReceipts.ts")).toBe(body("../new-receipts.ts"));
  });
});
