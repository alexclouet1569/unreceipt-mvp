// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ReceiptPdf, pdfFilenameFor, pdfFilenameSlug } from "../ReceiptPdf";
import type { Receipt } from "@/lib/types";

const baseReceipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: "22222222-2222-4222-8222-222222222222",
  transaction_id: null,
  user_id: "11111111-1111-4111-8111-111111111111",
  source: "manual",
  merchant_name: "ICA Maxi",
  merchant_address: "Sveavägen 12, Stockholm",
  merchant_phone: null,
  merchant_vat_number: "SE556677889901",
  merchant_siret: null,
  category: "meals",
  currency: "EUR",
  notes: "Lunch with client",
  receipt_number: null,
  receipt_date: "2026-05-03",
  receipt_time: null,
  purchased_at: "2026-05-03T12:00:00.000Z",
  subtotal: 40,
  tax_amount: 9,
  tax_rate: 25,
  tip_amount: null,
  total: 49,
  payment_method: "Visa",
  card_last_four: "1234",
  transaction_ref: "TXN-7788",
  image_url: null,
  image_captured_at: null,
  verification_code: null,
  capture_time_seconds: null,
  ocr_confidence: null,
  is_verified: true,
  original_source_url: null,
  original_source_kind: null,
  intake_ref: "msg_abc",
  parse_confidence: null,
  items: null,
  created_at: "2026-05-03T12:00:00.000Z",
  updated_at: "2026-05-03T12:00:00.000Z",
  ...overrides,
});

describe("ReceiptPdf", () => {
  it("renders a stable React-PDF element tree (snapshot)", () => {
    // Render to an HTML-ish string. react-pdf elements (Document/Page/Text)
    // come through as their lowercase tag names — good enough to lock down
    // layout structure and prevent unintentional changes.
    const html = renderToString(<ReceiptPdf receipt={baseReceipt()} />);
    expect(html).toMatchSnapshot();
  });

  it("renders without items[] block when no items present", () => {
    // Smoke test for the "no items" branch — the items table is omitted
    // when there are no line items, which is the common case for our
    // forwarded-email receipts.
    const html = renderToString(
      <ReceiptPdf
        receipt={baseReceipt({
          subtotal: null,
          tax_amount: null,
          tax_rate: null,
          notes: null,
          payment_method: null,
          merchant_vat_number: null,
        })}
      />
    );
    expect(html).toContain("Total");
    expect(html).toContain("ICA Maxi");
  });
});

describe("pdfFilenameSlug", () => {
  it("strips diacritics, spaces, and unsafe filename chars", () => {
    expect(pdfFilenameSlug("Café Crème / Paris*")).toBe("cafe-creme-paris");
    expect(pdfFilenameSlug("ICA Maxi")).toBe("ica-maxi");
    expect(pdfFilenameSlug("../etc/passwd")).toBe("etc-passwd");
    expect(pdfFilenameSlug("")).toBe("receipt");
    expect(pdfFilenameSlug(null)).toBe("receipt");
  });
});

describe("pdfFilenameFor", () => {
  it("builds unreceipt-<slug>-<date>.pdf using purchased_at when present", () => {
    const r = baseReceipt({ merchant_name: "ICA Maxi" });
    expect(pdfFilenameFor(r)).toBe("unreceipt-ica-maxi-2026-05-03.pdf");
  });

  it("falls back to receipt_date and to 'undated' when neither is parseable", () => {
    expect(
      pdfFilenameFor(
        baseReceipt({
          merchant_name: "Pret",
          purchased_at: null,
          receipt_date: "2026-04-01",
        })
      )
    ).toBe("unreceipt-pret-2026-04-01.pdf");

    expect(
      pdfFilenameFor(
        baseReceipt({
          merchant_name: null,
          purchased_at: null,
          receipt_date: null,
        })
      )
    ).toBe("unreceipt-receipt-undated.pdf");
  });
});
