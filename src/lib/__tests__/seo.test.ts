import { describe, expect, it } from "vitest";
import { getFaq } from "@/lib/faq";
import { PLANS, formatPrice } from "@/lib/plans";
import { landingJsonLd } from "@/lib/seo";

describe("landing FAQ + structured data", () => {
  it("prices every plan in the pricing answer, from plans.ts", () => {
    const pricing = getFaq(false).find((i) => i.q.includes("cost"))!;
    for (const plan of PLANS) {
      expect(pricing.a).toContain(`${plan.name} ${formatPrice(plan.price)}/month`);
      expect(pricing.a).toContain(`up to ${plan.receipts} receipts`);
    }
  });

  it("says free pilot vs. free first week depending on PILOT_MODE", () => {
    const answer = (pilot: boolean) =>
      getFaq(pilot).find((i) => i.q.includes("cost"))!.a;
    expect(answer(true)).toMatch(/free during the pilot/i);
    expect(answer(false)).toMatch(/first week is free/i);
  });

  it("FAQPage JSON-LD mirrors the visible FAQ exactly", () => {
    const graph = landingJsonLd(true)["@graph"];
    const faqPage = graph.find((n) => n["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(faqPage.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
      getFaq(true).map((i) => [i.q, i.a])
    );
  });

  it("lists one EUR offer per plan", () => {
    const app = landingJsonLd(false)["@graph"].find(
      (n) => n["@type"] === "SoftwareApplication"
    ) as { offers: { price: string; priceCurrency: string }[] };
    expect(app.offers.map((o) => o.price)).toEqual(PLANS.map((p) => p.price.toFixed(2)));
    expect(app.offers.every((o) => o.priceCurrency === "EUR")).toBe(true);
  });
});
