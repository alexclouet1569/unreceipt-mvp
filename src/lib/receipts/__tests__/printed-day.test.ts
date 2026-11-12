// Run in both zones by the suite: TZ=Europe/Stockholm and TZ=UTC must agree.
import { describe, expect, it } from "vitest";
import { dayOf, localDate, printedDay, printedMonth } from "../printed-day";
import { receiptDay } from "@/lib/bank/month";
import { receiptMonth } from "@/lib/firm/client-stats";
import { conversionDate } from "@/lib/fx";
import { formatDate, relativeDayGroup } from "@/lib/receipt-format";
import { purchaseDay } from "@/lib/analytics/money";
import { toMobileReceipt } from "@/lib/mobile/receipt";
import type { Receipt } from "@/lib/types";

// purchased_at holds the receipt's own clock written with a "Z".
const EVENINGS = [
  { at: "2026-12-31T23:30:00Z", day: "2026-12-31", month: "2026-12" }, // year end
  { at: "2026-03-31T23:30:00Z", day: "2026-03-31", month: "2026-03" }, // quarter end
  { at: "2026-06-30T23:30:00Z", day: "2026-06-30", month: "2026-06" }, // half-year end
  // The nights the clocks change in Stockholm (2:00 → 3:00 and 3:00 → 2:00).
  { at: "2026-03-29T02:30:00Z", day: "2026-03-29", month: "2026-03" },
  { at: "2026-10-25T02:30:00Z", day: "2026-10-25", month: "2026-10" },
  { at: "2026-10-31T23:59:00Z", day: "2026-10-31", month: "2026-10" },
];

describe("the printed day is never shifted", () => {
  it.each(EVENINGS)("$at stays on $day in every helper", ({ at, day, month }) => {
    const r = { receipt_date: null, purchased_at: at };
    expect(printedDay(r)).toBe(day);
    expect(printedMonth(r)).toBe(month);
    expect(purchaseDay(r)).toBe(day);
    expect(receiptDay(r)).toBe(day);
    expect(conversionDate(r)).toBe(day);
    expect(receiptMonth({ ...r, created_at: "2027-02-01T10:00:00Z" })).toBe(month);
    expect(formatDate(at)).toBe(new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }));
  });

  it("prefers the printed receipt_date over purchased_at, everywhere", () => {
    const r = { receipt_date: "2026-03-31", purchased_at: "2026-04-01T09:00:00Z" };
    expect(printedDay(r)).toBe("2026-03-31");
    expect(conversionDate(r)).toBe("2026-03-31");
    expect(receiptMonth({ ...r, created_at: "2026-04-02T10:00:00Z" })).toBe("2026-03");
  });

  it("files a receipt without a date in the month it arrived, in Stockholm (firm stats)", () => {
    expect(receiptMonth({ receipt_date: null, purchased_at: null, created_at: "2026-10-31T23:30:00Z" })).toBe("2026-11");
  });

  it("refuses what isn't a date", () => {
    expect(dayOf("garbage")).toBeNull();
    expect(dayOf("2026-13-01")).toBeNull();
    expect(printedDay({ receipt_date: null, purchased_at: null })).toBeNull();
  });
});

describe("Today / Yesterday on the list", () => {
  it("puts last evening's receipt in Yesterday just after midnight", () => {
    const justAfterMidnight = new Date(2026, 6, 1, 0, 10); // 1 Jul, 00:10 where the code runs
    expect(relativeDayGroup("2026-06-30T23:30:00Z", justAfterMidnight)).toBe("Yesterday");
    expect(relativeDayGroup("2026-07-01", justAfterMidnight)).toBe("Today");
  });

  it("counts days across the night the clocks change", () => {
    const morningAfter = new Date(2026, 2, 30, 8, 0); // 30 Mar, after the 23-hour 29 Mar
    expect(relativeDayGroup("2026-03-29T02:30:00Z", morningAfter)).toBe("Yesterday");
    expect(localDate("2026-03-29").getDate()).toBe(29);
  });
});

describe("the iPhone's date field", () => {
  const base = { id: "r", status: "verified", notes: null, items: null } as unknown as Receipt;
  it("is the printed day, with its clock time when purchased_at is that day", () => {
    expect(toMobileReceipt({ ...base, receipt_date: "2026-12-31", purchased_at: "2026-12-31T23:30:00Z" }).date).toBe("2026-12-31T23:30:00Z");
    expect(toMobileReceipt({ ...base, receipt_date: "2026-12-30", purchased_at: "2026-12-31T23:30:00Z" }).date).toBe("2026-12-30");
    expect(toMobileReceipt({ ...base, receipt_date: null, purchased_at: "2026-06-30T23:30:00Z" }).date).toBe("2026-06-30T23:30:00Z");
  });
});
