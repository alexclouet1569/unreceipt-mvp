import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceiptListItem } from "../ReceiptListItem";
import type { Receipt } from "@/lib/types";

afterEach(cleanup);

const baseReceipt: Receipt = {
  id: "r1",
  transaction_id: null,
  user_id: "u1",
  source: "paper",
  merchant_name: "ICA Kvantum",
  merchant_address: null,
  merchant_phone: null,
  merchant_vat_number: null,
  merchant_siret: null,
  category: "office_supplies",
  currency: "SEK",
  notes: null,
  receipt_number: null,
  receipt_date: new Date().toISOString().slice(0, 10),
  receipt_time: null,
  purchased_at: null,
  subtotal: null,
  tax_amount: null,
  tax_rate: null,
  tip_amount: null,
  total: 245,
  payment_method: null,
  card_last_four: null,
  transaction_ref: null,
  image_url: null,
  image_captured_at: null,
  verification_code: null,
  capture_time_seconds: null,
  ocr_confidence: null,
  is_verified: false,
  status: "verified",
  original_source_url: null,
  original_source_kind: null,
  intake_ref: null,
  parse_confidence: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("ReceiptListItem", () => {
  it("renders merchant initials, name, mono amount, and currency suffix", () => {
    render(<ReceiptListItem receipt={baseReceipt} />);
    expect(screen.getByText("IK")).toBeInTheDocument();
    expect(screen.getByText("ICA Kvantum")).toBeInTheDocument();
    expect(screen.getByText("245.00")).toBeInTheDocument();
    expect(screen.getByText("kr")).toBeInTheDocument();
  });

  it("emits a data-day-group attribute for parent grouping", () => {
    const { container } = render(<ReceiptListItem receipt={baseReceipt} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-day-group")).toBe("Today");
  });

  it("fires onClick when the card is clicked", async () => {
    const onClick = vi.fn();
    render(<ReceiptListItem receipt={baseReceipt} onClick={onClick} />);
    await userEvent.click(screen.getByText("ICA Kvantum"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders the category label in the meta row", () => {
    render(<ReceiptListItem receipt={baseReceipt} />);
    expect(screen.getByText(/Office supplies/)).toBeInTheDocument();
  });
});
