import { describe, expect, it } from "vitest";
// The website's version, imported only here (tests run in Node, never in the app).
import * as web from "@/lib/merchant-display";
import { getMerchantColor, getMerchantInitials } from "../merchant";

const NAMES = ["ICA Nära", "ica nära", "Uber", "SJ", "  Pressbyrån  ", "Café de Flore", "7-Eleven", "", null, "X", "Åhléns City"];

describe("merchant blocks", () => {
  it("match the website, so a merchant has the same colour and initials on both", () => {
    for (const name of NAMES) {
      expect(getMerchantColor(name), String(name)).toBe(web.getMerchantColor(name));
      expect(getMerchantInitials(name), String(name)).toBe(web.getMerchantInitials(name));
    }
  });
});
