import { describe, expect, it } from "vitest";
import { MERCHANT_LOGOS, merchantLogoDomain, merchantLogoSlug } from "@/lib/merchant-logos";

describe("merchantLogoSlug", () => {
  it("recognises store names the way receipts print them", () => {
    expect(merchantLogoSlug("ICA Maxi Stormarknad")).toBe("ica");
    expect(merchantLogoSlug("Clas Ohlson Drottninggatan")).toBe("clas_ohlson");
    expect(merchantLogoSlug("SJ AB")).toBe("sj");
    expect(merchantLogoSlug("Pressbyrån Centralen")).toBe("pressbyran");
    expect(merchantLogoSlug("HEMKÖP")).toBe("hemkop");
    expect(merchantLogoSlug("McDonald’s Kungsgatan")).toBe("mcdonalds");
    expect(merchantLogoSlug("7-Eleven")).toBe("7eleven");
    expect(merchantLogoSlug("Slack Technologies Limited")).toBe("slack");
  });

  it("covers French and European chains", () => {
    expect(merchantLogoSlug("E.Leclerc Hypermarché")).toBe("leclerc");
    expect(merchantLogoSlug("INTERMARCHÉ SUPER")).toBe("intermarche");
    expect(merchantLogoSlug("Super U Rennes")).toBe("super_u");
    expect(merchantLogoSlug("Decathlon Lyon")).toBe("decathlon");
    expect(merchantLogoSlug("Air France")).toBe("air_france");
    expect(merchantLogoSlug("DB Fernverkehr AG")).toBe("deutsche_bahn");
    expect(merchantLogoSlug("Albert Heijn 1234")).toBe("albert_heijn");
    expect(merchantLogoSlug("H&M Drottninggatan")).toBe("hm");
    expect(merchantLogoSlug("Österreichische Bundesbahnen")).toBe("oebb");
    expect(merchantLogoSlug("Sainsbury’s Local")).toBe("sainsburys");
  });

  it("doesn't mistake common words for French or European chains", () => {
    expect(merchantLogoSlug("Avis de passage")).toBeNull();
    expect(merchantLogoSlug("Casino de Paris")).toBeNull();
    expect(merchantLogoSlug("Bar U")).toBeNull();
    expect(merchantLogoSlug("Boulangerie du Coin")).toBeNull();
    expect(merchantLogoSlug("Orange Café")).toBeNull();
    expect(merchantLogoSlug("Le Boulanger de Montmartre")).toBeNull();
    expect(merchantLogoSlug("Boucherie Picard")).toBeNull();
    expect(merchantLogoSlug("Casa de Cultura")).toBeNull();
  });

  it("only matches whole words", () => {
    expect(merchantLogoSlug("Kuberna Bar")).toBeNull();
    expect(merchantLogoSlug("Musica Shop")).toBeNull();
    expect(merchantLogoSlug("Cooperativa")).toBeNull();
  });

  it("leaves ambiguous names to the initials badge", () => {
    expect(merchantLogoSlug("Boulangerie Paul SAS")).toBeNull();
    expect(merchantLogoSlug("Slack Bar")).toBeNull();
    expect(merchantLogoSlug("Apple Pie Café")).toBeNull();
    expect(merchantLogoSlug("")).toBeNull();
    expect(merchantLogoSlug(null)).toBeNull();
  });
});

describe("merchantLogoDomain", () => {
  it("returns the domain only for slugs on the list", () => {
    expect(merchantLogoDomain("ica")).toBe("ica.se");
    expect(merchantLogoDomain("evil.example")).toBeNull();
    expect(merchantLogoDomain("__proto__")).toBeNull();
    expect(merchantLogoDomain("constructor")).toBeNull();
  });

  it("lists only plain hostnames", () => {
    for (const { domain } of Object.values(MERCHANT_LOGOS)) {
      expect(domain).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
  });
});
