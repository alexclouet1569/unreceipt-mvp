import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_GUIDE_PATH, recommendEmail } from "../recommend";

const JOIN = "https://app.unreceipt.com/app/connect/AbCdEfGhIjKlMnOpQrStUv";
const GUIDE = `https://app.unreceipt.com${CLIENT_GUIDE_PATH}`;

describe("recommendEmail", () => {
  it("is Swedish, carries the firm's link and the guide, and names the English buttons", () => {
    const { subject, body } = recommendEmail({ firmName: "Bergström Redovisning AB", joinUrl: JOIN, guideUrl: GUIDE });
    expect(subject).toBe("Så skickar du kvitton till oss med UnReceipt");
    expect(body).toContain("Vi på Bergström Redovisning AB tar emot kvitton");
    expect(body).toContain(`1. Öppna vår länk: ${JOIN}`);
    expect(body).toContain(`En kort guide (på engelska): ${GUIDE}`);
    expect(body).toContain('"Yes, share"');
    expect(body).toContain('"I already have an account"');
    expect(body.endsWith("Vänliga hälsningar\nBergström Redovisning AB")).toBe(true);
  });

  it("says what the firm sees, as the product does", () => {
    const { body } = recommendEmail({ firmName: "Byrån", joinUrl: JOIN, guideUrl: GUIDE });
    expect(body).toContain('Inget delas förrän du trycker på "Yes, share".');
    expect(body).toContain("ansluten Gmail eller Outlook ser vi först när du har bekräftat dem");
  });

  it("names no price (the store app shares it too)", () => {
    const { subject, body } = recommendEmail({ firmName: "Byrån", joinUrl: JOIN, guideUrl: GUIDE });
    for (const text of [subject, body]) {
      expect(text).not.toMatch(/\bkr\b|€|SEK|EUR|gratis|kostnadsfri|pris|free/i);
    }
  });

  it("reads well without a firm name", () => {
    const { body } = recommendEmail({ firmName: "  ", joinUrl: JOIN, guideUrl: GUIDE });
    expect(body.startsWith("Hej!\n\nVi tar emot kvitton")).toBe(true);
    expect(body.endsWith("Vänliga hälsningar")).toBe(true);
  });
});

describe("the client guide served from public/", () => {
  it("is the same file as the guide in docs/onboarding", () => {
    const root = process.cwd();
    const hash = (p: string) => createHash("sha256").update(readFileSync(path.join(root, p))).digest("hex");
    expect(hash(`public${CLIENT_GUIDE_PATH}`)).toBe(hash("docs/onboarding/UnReceipt-Get-started-companies.pdf"));
  });
});

describe("offersRecommendText", () => {
  it("offers the Swedish text to Swedish firms and firms with no country", async () => {
    const { offersRecommendText } = await import("../recommend");
    expect(offersRecommendText("SE")).toBe(true);
    expect(offersRecommendText("se")).toBe(true);
    expect(offersRecommendText(null)).toBe(true);
    expect(offersRecommendText(undefined)).toBe(true);
  });

  it("leaves it out for firms in other countries", async () => {
    const { offersRecommendText } = await import("../recommend");
    expect(offersRecommendText("FR")).toBe(false);
    expect(offersRecommendText("DE")).toBe(false);
  });
});
