// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { ClaimPdf } from "../ClaimPdf";
import { buildClaimLines, claimTotals, type ClaimReceipt } from "@/lib/claims/claim";

const receipt = (o: Partial<ClaimReceipt>): ClaimReceipt => ({
  id: "22222222-2222-4222-8222-222222222222",
  merchant_name: "Le Bistrot",
  merchant_address: "43100 BRIOUDE",
  category: "meals",
  currency: "EUR",
  total: 21.5,
  receipt_date: "2026-05-05",
  receipt_time: "12:41:00",
  purchased_at: "2026-05-05T12:00:00.000Z",
  status: "verified",
  items: null,
  claim_place: null,
  claim_purpose: "Réunion MT IDEST",
  claim_type: null,
  ...o,
});

describe("ClaimPdf", () => {
  it("renders a summary page and one sheet page per two receipts", async () => {
    const lines = buildClaimLines([
      receipt({}),
      receipt({ id: "33333333-3333-4333-8333-333333333333", receipt_time: "20:10", total: 32 }),
      receipt({ id: "44444444-4444-4444-8444-444444444444", category: "transport", merchant_name: "Indigo", total: 6 }),
    ]);
    const pdf = await renderToBuffer(
      <ClaimPdf
        month="2026-05"
        person="Fabienne Example"
        lines={lines}
        totals={claimTotals(lines)}
        images={{}}
        pendingCount={1}
        generatedOn="2026-10-21"
      />,
    );
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    // 1 summary page + 2 sheet pages (3 receipts, two per page).
    expect(text.match(/\/Type \/Page\b/g)?.length).toBe(3);
  });
});
