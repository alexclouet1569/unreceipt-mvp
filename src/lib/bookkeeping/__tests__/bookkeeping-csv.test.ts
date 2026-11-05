import { describe, expect, it } from "vitest";
import { BOOKKEEPING_COLUMNS, buildBookkeepingCsv } from "@/lib/bookkeeping/bookkeeping-csv";
import type { Receipt } from "@/lib/types";

const receipt = (o: Partial<Receipt> = {}): Receipt =>
  ({
    id: "22222222-2222-4222-8222-222222222222",
    merchant_name: "ICA Maxi",
    purchased_at: "2026-10-03T12:00:00.000Z",
    receipt_date: "2026-10-03",
    total: 181,
    currency: "SEK",
    tax_amount: 31,
    tax_rate: null,
    vat_lines: [
      { rate: 25, net: 100, vat: 25 },
      { rate: 12, net: 50, vat: 6 },
    ],
    category: "meals",
    payment_method: "Card",
    status: "verified",
    source: "paper",
    seller_org_number: "556677-8899",
    merchant_vat_number: "SE556677889901",
    bas_account: null,
    exported_at: null,
    booked_ref: null,
    created_at: "2026-10-03T13:05:00.000Z",
    ...o,
  }) as Receipt;

describe("buildBookkeepingCsv", () => {
  it("writes one row per VAT rate with the account suggestion", () => {
    const csv = buildBookkeepingCsv([
      { receipt: receipt(), pdfFile: "pdf/a.pdf", originalFile: "originals/a.jpg" },
    ]);
    expect(csv.startsWith("﻿" + BOOKKEEPING_COLUMNS.join(";"))).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      "2026-10-03;22222222-2222-4222-8222-222222222222;ICA Maxi;556677-8899;SE556677889901;SEK;181,00;181,00;25;100,00;25,00;5800;Resekostnader (måltid);2640;Meals & dining;Card;Ready;;;pdf/a.pdf;originals/a.jpg"
    );
    expect(lines[2]).toContain(";12;50,00;6,00;5800;");
  });

  it("uses the firm's account, blanks Total SEK for foreign currency, and skips the VAT account on a 0 line", () => {
    const csv = buildBookkeepingCsv([
      {
        receipt: receipt({
          currency: "EUR",
          vat_lines: null,
          tax_amount: null,
          total: 80,
          bas_account: "5410",
          exported_at: "2026-11-05T09:00:00Z",
          booked_ref: "V-12",
        }),
        pdfFile: null,
        originalFile: null,
      },
    ]);
    const line = csv.slice(1).trimEnd().split("\r\n")[1];
    expect(line).toContain(";EUR;80,00;;0;80,00;0,00;5410;;;Meals & dining;");
    expect(line).toContain(";Ready;2026-11-05;V-12;;");
  });
});
