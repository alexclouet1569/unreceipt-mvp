import { describe, expect, it } from "vitest";
import {
  MAX_EDIT_HISTORY,
  diffTrackedFields,
  editMarker,
  editedFieldLabels,
  editedOnLabel,
  originalValues,
} from "@/lib/receipts/edits";
import type { EditHistoryEntry } from "@/lib/types";

const NOW = new Date("2026-10-15T09:30:00.000Z");

describe("diffTrackedFields", () => {
  it("returns only tracked fields whose value changes", () => {
    expect(
      diffTrackedFields(
        { total: 49, merchant_name: "ICA", category: "meals", notes: null },
        { total: 59, merchant_name: "ICA", category: "travel", notes: "x" },
      ),
    ).toEqual({ total: { from: 49, to: 59 } });
  });

  it("compares numbers as numbers (Postgres numeric can be a string)", () => {
    expect(
      diffTrackedFields({ total: "49.50" as unknown as number }, { total: 49.5 }),
    ).toEqual({});
  });

  it("treats filling an empty field as a change", () => {
    expect(diffTrackedFields({ tax_amount: null }, { tax_amount: 9.8 })).toEqual({
      tax_amount: { from: null, to: 9.8 },
    });
  });

  it("compares line items by content", () => {
    const items = [{ label: "Kaffe", qty: 1, unit_amount: null, total_amount: 35 }];
    expect(diffTrackedFields({ items }, { items: [...items] })).toEqual({});
    expect(
      Object.keys(
        diffTrackedFields({ items }, { items: [{ ...items[0], total_amount: 40 }] }),
      ),
    ).toEqual(["items"]);
  });
});

describe("editMarker", () => {
  it("is empty when no tracked field changes", () => {
    expect(editMarker({ total: 49 }, { total: 49, category: "meals" }, NOW)).toEqual(
      {},
    );
  });

  it("stamps the time, who, the field and a history entry", () => {
    expect(editMarker({ total: 49 }, { total: 59 }, NOW, "user-1")).toEqual({
      edited_at: NOW.toISOString(),
      edited_fields: ["total"],
      edit_history: [
        { at: NOW.toISOString(), by: "user-1", changes: { total: { from: 49, to: 59 } } },
      ],
    });
  });

  it("caps the history length", () => {
    const history: EditHistoryEntry[] = Array.from(
      { length: MAX_EDIT_HISTORY },
      (_, i) => ({ at: `t${i}`, changes: { total: { from: i, to: i + 1 } } }),
    );
    const marker = editMarker(
      { total: 1, edited_fields: ["total"], edit_history: history },
      { total: 2 },
      NOW,
    );
    expect(marker.edit_history).toHaveLength(MAX_EDIT_HISTORY);
    expect(marker.edit_history!.at(-1)!.at).toBe(NOW.toISOString());
    // The first entry (the originally captured values) is never dropped.
    expect(marker.edit_history![0].at).toBe("t0");
    expect(marker.edit_history![1].at).toBe("t2");
  });
});

describe("display helpers", () => {
  it("formats the edit date in Swedish time", () => {
    // 23:30 UTC on the 14th is already the 15th in Stockholm.
    expect(editedOnLabel({ edited_at: "2026-10-14T23:30:00.000Z" })).toBe(
      "Oct 15, 2026",
    );
    expect(editedOnLabel({ edited_at: null })).toBeNull();
  });

  it("labels edited fields in a stable order", () => {
    expect(
      editedFieldLabels({ edited_fields: ["items", "total", "merchant_name"] }),
    ).toEqual(["Merchant", "Total", "Line items"]);
  });

  it("reports each field's value before the first change", () => {
    expect(
      originalValues({
        currency: "SEK",
        edit_history: [
          {
            at: "a",
            changes: {
              total: { from: 245, to: 250 },
              tax_amount: { from: null, to: 50 },
            },
          },
          { at: "b", changes: { total: { from: 250, to: 260 } } },
        ],
      }),
    ).toEqual([
      { label: "Total", was: "245.00 kr" },
      { label: "VAT amount", was: "empty" },
    ]);
  });
});
