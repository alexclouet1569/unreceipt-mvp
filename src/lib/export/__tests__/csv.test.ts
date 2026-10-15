import { describe, expect, it } from "vitest";
import { buildReceiptsCsv, csvAmount, csvCell } from "@/lib/export/csv";
import type { Receipt } from "@/lib/types";

const receipt = (o: Partial<Receipt> = {}): Receipt =>
  ({
    id: "22222222-2222-4222-8222-222222222222",
    merchant_name: "ICA Maxi",
    purchased_at: "2026-10-03T12:00:00.000Z",
    receipt_date: "2026-10-03",
    total: 245.5,
    currency: "SEK",
    tax_amount: 49.1,
    tax_rate: 25,
    category: "meals",
    payment_method: "Card",
    status: "verified",
    source: "paper",
    edited_at: null,
    notes: null,
    card_last_four: "4421",
    merchant_vat_number: "SE556677889901",
    created_at: "2026-10-03T13:05:00.000Z",
    ...o,
  }) as Receipt;

describe("csv", () => {
  it("neutralises spreadsheet formulas from untrusted text", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+46 70")).toBe("'+46 70");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("quotes separators, quotes and newlines", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
  });

  it("writes amounts with a decimal comma", () => {
    expect(csvAmount(245.5)).toBe("245,50");
    expect(csvAmount("49.10")).toBe("49,10");
    expect(csvAmount(null)).toBe("");
  });

  it("starts with a BOM and has one CRLF line per receipt", () => {
    const csv = buildReceiptsCsv([
      { receipt: receipt(), pdfFile: "pdf/a.pdf", originalFile: "originals/a.jpg" },
      {
        receipt: receipt({ status: "pending_review", edited_at: "2026-10-05T10:00:00Z" }),
        pdfFile: null,
        originalFile: null,
      },
    ]);
    expect(csv.startsWith("﻿Date;Merchant;Total;")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      "2026-10-03;ICA Maxi;245,50;SEK;49,10;25;Meals & dining;Card;4421;SE556677889901;Ready;paper;;;pdf/a.pdf;originals/a.jpg;2026-10-03 15:05;22222222-2222-4222-8222-222222222222",
    );
    expect(lines[2]).toContain(";Needs review;paper;2026-10-05;");
  });
});

describe("receiptDate", () => {
  it("uses the Swedish calendar day", async () => {
    const { receiptDate } = await import("@/lib/export/csv");
    // 23:30 UTC on Oct 31 is 00:30 on Nov 1 in Stockholm.
    expect(receiptDate({ purchased_at: "2026-10-31T23:30:00Z", receipt_date: null })).toBe(
      "2026-11-01",
    );
    expect(receiptDate({ purchased_at: null, receipt_date: "2026-10-03" })).toBe("2026-10-03");
  });
});
