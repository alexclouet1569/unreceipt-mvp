// How the receipts list is cut into sections. Pure, so it's tested.
//
// What needs the user comes first ("To confirm": missing fields or waiting
// for a confirmation), then the done receipts by day. A receipt is in one
// section only. The server already sorts newest first (purchase date, then
// creation), and that order is kept inside each section.

import type { MobileReceipt } from "@/lib/mobile/types";
import type { Strings } from "../i18n/en";
import type { Locale } from "../i18n/core";
import { dayGroup, monthLabel, parseReceiptDate, type DayGroup } from "./format";

export type ReceiptSection = {
  key: string;
  title: string;
  attention: boolean;
  data: MobileReceipt[];
};

function groupKey(g: DayGroup): string {
  return g.kind === "month" ? `m-${g.year}-${g.month}` : g.kind;
}

function groupTitle(g: DayGroup, strings: Strings, locale: Locale, now: Date): string {
  switch (g.kind) {
    case "today":
      return strings.receipts.today;
    case "yesterday":
      return strings.receipts.yesterday;
    case "thisWeek":
      return strings.receipts.thisWeek;
    case "noDate":
      return strings.receipts.noDate;
    case "month":
      return monthLabel(g.year, g.month, locale, now);
  }
}

export function buildSections(
  receipts: MobileReceipt[],
  strings: Strings,
  locale: Locale,
  now: Date = new Date(),
): ReceiptSection[] {
  const toConfirm = receipts.filter((r) => r.status === "pending_review");
  const sections: ReceiptSection[] = [];
  if (toConfirm.length > 0) {
    sections.push({
      key: "toConfirm",
      title: strings.receipts.toConfirm,
      attention: true,
      data: toConfirm,
    });
  }

  const byKey = new Map<string, ReceiptSection>();
  for (const r of receipts) {
    if (r.status === "pending_review") continue;
    const g = dayGroup(parseReceiptDate(r.date), now);
    const key = groupKey(g);
    let section = byKey.get(key);
    if (!section) {
      section = { key, title: groupTitle(g, strings, locale, now), attention: false, data: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    section.data.push(r);
  }
  // Undated receipts last, whatever the server order.
  const undated = sections.findIndex((x) => x.key === "noDate");
  if (undated !== -1) sections.push(...sections.splice(undated, 1));
  return sections;
}

/**
 * Where "Load more" starts: the list key of the last row that has one. A
 * receipt just saved from a scan has none until the next refresh brings
 * the server's row; it is skipped, and if the page brings it again the
 * list shows it once (the list drops ids it already has).
 */
export function loadMoreCursor(rows: ReadonlyArray<Pick<MobileReceipt, "listKey">>): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const key = rows[i].listKey;
    if (key) return key;
  }
  return null;
}
