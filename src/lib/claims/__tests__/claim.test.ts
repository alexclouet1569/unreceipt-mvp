import { describe, expect, it } from "vitest";
import {
  buildClaimLines,
  cityFromAddress,
  claimMonthLabel,
  claimTime,
  claimTotals,
  inferClaimType,
  parseClaimMonth,
  shiftMonth,
  type ClaimReceipt,
} from "@/lib/claims/claim";

let seq = 0;
const receipt = (o: Partial<ClaimReceipt> = {}): ClaimReceipt => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  merchant_name: "Le Bistrot",
  merchant_address: null,
  category: "meals",
  currency: "EUR",
  total: 20,
  receipt_date: "2026-05-05",
  receipt_time: null,
  purchased_at: "2026-05-05T12:00:00.000Z",
  status: "verified",
  items: null,
  claim_place: null,
  claim_purpose: null,
  claim_type: null,
  ...o,
});

describe("inferClaimType", () => {
  it("tells lunch from dinner by the time on the receipt", () => {
    expect(inferClaimType(receipt({ receipt_time: "12:41:00" }))).toBe("lunch");
    expect(inferClaimType(receipt({ receipt_time: "20:05" }))).toBe("dinner");
    expect(inferClaimType(receipt({ receipt_time: null }))).toBe("lunch");
  });

  it("files hotels as overnight stays", () => {
    expect(inferClaimType(receipt({ category: "accommodation" }))).toBe("overnight");
  });

  it("reads parking, tolls, fuel, taxis and trains from the merchant", () => {
    const t = (merchant_name: string, category: ClaimReceipt["category"] = "transport") =>
      inferClaimType(receipt({ merchant_name, category }));
    expect(t("Indigo Parking Jaude")).toBe("parking");
    expect(t("APRR Péage de Gerzat")).toBe("toll");
    expect(t("TotalEnergies Relais Brioude")).toBe("fuel");
    expect(t("Uber")).toBe("taxi");
    expect(t("SNCF Voyageurs", "travel")).toBe("train");
    expect(t("Eurolines", "travel")).toBe("train");
    expect(t("Garage Dupont")).toBe("other");
  });

  it("never turns office supplies into fuel because of a line label", () => {
    expect(
      inferClaimType(
        receipt({
          category: "office_supplies",
          merchant_name: "Bureau Vallée",
          items: [{ label: "Essence de vanille", qty: 1, unit_amount: 3, total_amount: 3 }],
        }),
      ),
    ).toBe("other");
  });
});

describe("cityFromAddress", () => {
  it("reads the town after a French or Swedish postcode", () => {
    expect(cityFromAddress("12 rue du Commerce, 43100 BRIOUDE")).toBe("Brioude");
    expect(cityFromAddress("Place de Jaude 63000 CLERMONT-FERRAND CEDEX 1")).toBe(
      "Clermont-Ferrand",
    );
    expect(cityFromAddress("Drottninggatan 5, 111 51 Stockholm")).toBe("Stockholm");
  });

  it("returns null without a postcode", () => {
    expect(cityFromAddress("Rue de la Gare")).toBeNull();
    expect(cityFromAddress(null)).toBeNull();
  });
});

describe("claimTime", () => {
  it("keeps HH:MM and rejects anything else", () => {
    expect(claimTime("9:05:00")).toBe("09:05");
    expect(claimTime("25:00")).toBeNull();
    expect(claimTime("noon")).toBeNull();
  });
});

describe("buildClaimLines", () => {
  it("numbers receipts in date and time order", () => {
    const lines = buildClaimLines([
      receipt({ receipt_date: "2026-05-21", merchant_name: "C" }),
      receipt({ receipt_date: "2026-05-05", receipt_time: "19:30", merchant_name: "B" }),
      receipt({ receipt_date: "2026-05-05", receipt_time: "12:10", merchant_name: "A" }),
    ]);
    expect(lines.map((l) => [l.number, l.receipt.merchant_name])).toEqual([
      [1, "A"],
      [2, "B"],
      [3, "C"],
    ]);
    expect(lines.map((l) => l.type)).toEqual(["lunch", "dinner", "lunch"]);
  });

  it("prefers what the person saved over any suggestion", () => {
    const [line] = buildClaimLines([
      receipt({
        merchant_address: "43100 BRIOUDE",
        claim_place: "Murat",
        claim_purpose: "Visites médicales",
        claim_type: "dinner",
      }),
    ]);
    expect(line).toMatchObject({
      place: "Murat",
      purpose: "Visites médicales",
      type: "dinner",
      suggested: { type: false, place: false, purpose: false },
    });
  });

  it("suggests place and purpose from the same day, then from earlier trips", () => {
    const lines = buildClaimLines(
      [
        receipt({ id: "a", receipt_date: "2026-05-05", claim_place: "Brioude", claim_purpose: "Réunion MT IDEST" }),
        receipt({ id: "b", receipt_date: "2026-05-05", category: "transport", merchant_name: "Indigo" }),
        receipt({ id: "c", receipt_date: "2026-05-21", merchant_address: "15300 MURAT" }),
        receipt({ id: "d", receipt_date: "2026-05-28", merchant_address: "1 av. X 75001 PARIS" }),
      ],
      [
        { claim_place: "Murat", claim_purpose: "Old purpose", purchased_at: null, receipt_date: "2026-01-10" },
        { claim_place: "MURAT", claim_purpose: "Visites médicales", purchased_at: null, receipt_date: "2026-03-02" },
      ],
    );
    const byId = Object.fromEntries(lines.map((l) => [l.receipt.id, l]));
    expect(byId.b).toMatchObject({
      place: "Brioude",
      purpose: "Réunion MT IDEST",
      type: "parking",
      suggested: { place: true, purpose: true, type: true },
    });
    expect(byId.c).toMatchObject({ place: "Murat", purpose: "Visites médicales" });
    // Nothing points at a purpose for Paris: left blank rather than guessed.
    expect(byId.d).toMatchObject({ place: "Paris", purpose: "", suggested: { purpose: false } });
  });
});

describe("claimTotals", () => {
  it("adds ready lines per type and currency, never across currencies", () => {
    const lines = buildClaimLines([
      receipt({ total: 18.4 }),
      receipt({ total: 21.5 }),
      receipt({ total: 32, receipt_time: "20:00" }),
      receipt({ total: 100, currency: "SEK" }),
      receipt({ total: 50, status: "pending_review" }),
    ]);
    const { byType, byCurrency } = claimTotals(lines);
    expect(byType).toEqual([
      { type: "lunch", currency: "EUR", count: 2, amount: 39.9 },
      { type: "lunch", currency: "SEK", count: 1, amount: 100 },
      { type: "dinner", currency: "EUR", count: 1, amount: 32 },
    ]);
    expect(byCurrency).toEqual([
      { currency: "EUR", amount: 71.9, count: 3 },
      { currency: "SEK", amount: 100, count: 1 },
    ]);
  });
});

describe("months", () => {
  it("parses strictly and shifts across years", () => {
    expect(parseClaimMonth("2026-05")).toBe("2026-05");
    expect(parseClaimMonth("2026-13")).toBeNull();
    expect(parseClaimMonth("2026-05-01")).toBeNull();
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(claimMonthLabel("2026-05")).toBe("May 2026");
  });
});
