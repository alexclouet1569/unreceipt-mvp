import { describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({ usePathname: () => "/" }));

import { receiptRoutesFor } from "../routes";

describe("receiptRoutesFor", () => {
  it("keeps a receipt in the tab it was opened from", () => {
    expect(receiptRoutesFor("/receipt/abc")).toEqual({ detail: "/receipt/[id]", edit: "/receipt/edit", photo: "/receipt/photo", firm: false });
    expect(receiptRoutesFor("/insights/list")).toMatchObject({ detail: "/insights/receipt/[id]", firm: false });
  });

  it("marks a client's receipt opened from the Clients tab (no Delete there)", () => {
    expect(receiptRoutesFor("/clients/client/org-1")).toEqual({
      detail: "/clients/receipt/[id]",
      edit: "/clients/receipt/edit",
      photo: "/clients/receipt/photo",
      firm: true,
    });
  });
});
