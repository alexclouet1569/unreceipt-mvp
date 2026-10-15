import { describe, expect, it } from "vitest";
import { getFaq } from "@/lib/faq";
import { PLANS, formatPrice, formatSek } from "@/lib/plans";
import { landingJsonLd } from "@/lib/seo";
import { LANDING_COPY, fill } from "@/app/_landing-copy";

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

describe("Swedish landing (/sv)", () => {
  it("prices every plan in kronor in the Swedish pricing answer", () => {
    const pricing = getFaq(false, "sv").find((i) => i.q === "Vad kostar UnReceipt?")!;
    for (const plan of PLANS) {
      expect(pricing.a).toContain(`${plan.name} ${formatSek(plan.priceSek)}/mån`);
      expect(pricing.a).toContain(`upp till ${plan.receipts} kvitton`);
    }
    expect(pricing.a).not.toContain("€");
    expect(getFaq(true, "sv").find((i) => i.q === "Vad kostar UnReceipt?")!.a).toMatch(
      /gratis under piloten/i
    );
  });

  it("asks the same number of questions as the English FAQ", () => {
    expect(getFaq(true, "sv")).toHaveLength(getFaq(true, "en").length);
  });

  it("FAQPage JSON-LD mirrors the Swedish FAQ and offers SEK prices", () => {
    const graph = landingJsonLd(true, "sv")["@graph"];
    const faqPage = graph.find((n) => n["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(faqPage.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
      getFaq(true, "sv").map((i) => [i.q, i.a])
    );
    const app = graph.find((n) => n["@type"] === "SoftwareApplication") as {
      offers: { price: string; priceCurrency: string }[];
    };
    expect(app.offers.map((o) => o.price)).toEqual(PLANS.map((p) => p.priceSek.toFixed(2)));
    expect(app.offers.every((o) => o.priceCurrency === "SEK")).toBe(true);
  });
});

describe("landing copy", () => {
  // Every `{placeholder}` in an English string must exist in its Swedish
  // counterpart, or the Swedish page would print a raw `{price}`.
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
  const strings = (value: unknown, path = ""): [string, string][] =>
    typeof value === "string"
      ? [[path, value]]
      : value && typeof value === "object"
        ? Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`))
        : [];

  it("keeps the same placeholders in both languages", () => {
    const sv = new Map(strings(LANDING_COPY.sv));
    for (const [path, en] of strings(LANDING_COPY.en)) {
      if (!sv.has(path)) continue; // the two endings differ on purpose
      expect(placeholders(sv.get(path)!), path).toEqual(placeholders(en));
    }
  });

  it("fills placeholders", () => {
    expect(fill("{plan} fits — {price}", { plan: "Light", price: "69 kr" })).toBe(
      "Light fits — 69 kr"
    );
    expect(fill("{missing}", {})).toBe("{missing}");
  });
});
