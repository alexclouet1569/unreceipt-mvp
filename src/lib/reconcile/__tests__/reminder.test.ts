import { describe, expect, it } from "vitest";
import { buildReminderEmail, periodLabel } from "../reminder";
import { buildReconciliationCsv } from "../csv";
import { reconcile } from "../match";

const missing = [
  { date: "2026-09-05", text: "BAUHAUS MALMO", amount: -1899, currency: "SEK" },
  { date: "2026-09-21", text: "=HYPERLINK(evil)", amount: -45.5, currency: "SEK" },
];

describe("periodLabel", () => {
  it("names the month in the client's language", () => {
    expect(periodLabel("2026-09", "sv")).toBe("september 2026");
    expect(periodLabel("2026-09", "en")).toBe("September 2026");
  });
});

describe("buildReminderEmail", () => {
  it("writes the Swedish reminder with every missing purchase", () => {
    const email = buildReminderEmail({
      locale: "sv",
      clientFirstName: "Anna",
      firmName: "Exempelbyrån",
      period: "2026-09",
      missing,
    });
    expect(email.subject).toBe("2 kvitton saknas för september 2026");
    expect(email.text).toContain("Hej Anna,");
    expect(email.text).toMatch(/5 sep\.? · BAUHAUS MALMO · 1\s899,00 kr/);
    expect(email.text).toContain("Exempelbyrån");
  });

  it("uses the singular for one receipt", () => {
    const email = buildReminderEmail({
      locale: "en",
      clientFirstName: "Anna",
      firmName: "Example & Co",
      period: "2026-09",
      missing: missing.slice(0, 1),
    });
    expect(email.subject).toBe("1 receipt missing for September 2026");
    expect(email.text).toContain("the receipt for this purchase");
  });
});

describe("buildReconciliationCsv", () => {
  it("writes one row per line and defuses formula-like bank texts", () => {
    const statement = missing.map((m, i) => ({ ...m, id: `L${i + 1}` }));
    const result = reconcile(statement, []);
    const csv = buildReconciliationCsv(result.lines, []);
    const rows = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(rows[0]).toBe(
      "Date;Bank text;Amount;Currency;Status;Receipt merchant;Receipt date;Receipt total;Receipt currency;Note",
    );
    expect(rows[1]).toBe("2026-09-05;BAUHAUS MALMO;-1899,00;SEK;Missing;;;;;");
    expect(rows[2]).toContain("'=HYPERLINK(evil)");
  });
});
