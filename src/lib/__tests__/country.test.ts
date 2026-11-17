import { describe, expect, it } from "vitest";
import { chosenCountry, defaultCurrencyFor, guessCountry, isCountryCode, SIGNUP_COUNTRIES } from "@/lib/country";
import { DEFAULT_CURRENCY_BY_COUNTRY, FALLBACK_HOME_CURRENCY } from "@/lib/bookkeeping/rules";
import { HOME_CURRENCY_OPTIONS } from "@/lib/receipt-format";

describe("guessCountry", () => {
  it("follows how the device is set up, even abroad", () => {
    // A Swede in Spain: Swedish phone, Spanish location.
    expect(guessCountry({ acceptLanguage: "sv-SE,sv;q=0.9,en;q=0.8", ipCountry: "ES" })).toBe("SE");
    // iOS in English with the region set to Sweden.
    expect(guessCountry({ acceptLanguage: "en-SE,en;q=0.9", ipCountry: "DE" })).toBe("SE");
    expect(guessCountry({ acceptLanguage: "pl-PL,pl;q=0.9", ipCountry: "PL" })).toBe("PL");
    expect(guessCountry({ acceptLanguage: "de-CH", ipCountry: "DE" })).toBe("CH");
  });

  it("reads a bare language only when one country speaks it", () => {
    expect(guessCountry({ acceptLanguage: "sv" })).toBe("SE");
    expect(guessCountry({ acceptLanguage: "nb" })).toBe("NO");
    expect(guessCountry({ acceptLanguage: "cs" })).toBe("CZ");
    expect(guessCountry({ acceptLanguage: "de", ipCountry: "AT" })).toBe("AT");
    expect(guessCountry({ acceptLanguage: "fr", ipCountry: "BE" })).toBe("BE");
  });

  it("doesn't trust the browser defaults en-US and en-GB unless the location agrees", () => {
    expect(guessCountry({ acceptLanguage: "en-US,en;q=0.9", ipCountry: "SE" })).toBe("SE");
    expect(guessCountry({ acceptLanguage: "en-GB", ipCountry: "PL" })).toBe("PL");
    expect(guessCountry({ acceptLanguage: "en-GB", ipCountry: "GB" })).toBe("GB");
    expect(guessCountry({ acceptLanguage: "en-US", ipCountry: "US" })).toBe("US");
  });

  it("uses the sign-in address's country domain before the location", () => {
    expect(guessCountry({ acceptLanguage: "en-US", email: "anna@firma.se", ipCountry: "ES" })).toBe("SE");
    expect(guessCountry({ email: "jan@biuro.pl" })).toBe("PL");
    expect(guessCountry({ email: "tom@shop.co.uk" })).toBe("GB");
    // Generic and look-alike domains say nothing.
    expect(guessCountry({ email: "anna@gmail.com", ipCountry: "DK" })).toBe("DK");
    expect(guessCountry({ email: "dev@startup.io", ipCountry: "FI" })).toBe("FI");
  });

  it("says nothing without a sign", () => {
    expect(guessCountry({})).toBeNull();
    expect(guessCountry({ acceptLanguage: "en", email: "a@gmail.com" })).toBeNull();
    expect(guessCountry({ ipCountry: "XX" })).toBeNull();
    expect(guessCountry({ ipCountry: "not a country" })).toBeNull();
    expect(guessCountry({ acceptLanguage: "*" })).toBeNull();
    // Made-up codes are no guess.
    expect(guessCountry({ acceptLanguage: "xx-ZZ" })).toBeNull();
    expect(guessCountry({ email: "a@b.zz" })).toBeNull();
    expect(guessCountry({ acceptLanguage: "xx-ZZ", ipCountry: "NO" })).toBe("NO");
  });
});

describe("defaultCurrencyFor", () => {
  it("gives each country its own currency", () => {
    expect(defaultCurrencyFor("SE")).toBe("SEK");
    expect(defaultCurrencyFor("FR")).toBe("EUR");
    expect(defaultCurrencyFor("NO")).toBe("NOK");
    expect(defaultCurrencyFor("PL")).toBe("PLN");
    expect(defaultCurrencyFor("BG")).toBe("EUR"); // euro since 2026-01-01
    expect(defaultCurrencyFor("HR")).toBe("EUR");
    expect(defaultCurrencyFor("LI")).toBe("CHF");
  });

  it("falls back to the euro where the currency has no ECB rate", () => {
    for (const c of ["RS", "UA", "MD", "JP"]) expect(defaultCurrencyFor(c)).toBe(FALLBACK_HOME_CURRENCY);
  });

  it("only ever picks a currency a company can have", () => {
    for (const cur of [...Object.values(DEFAULT_CURRENCY_BY_COUNTRY), FALLBACK_HOME_CURRENCY]) {
      expect(HOME_CURRENCY_OPTIONS as readonly string[]).toContain(cur);
    }
  });
});

describe("sign-up countries", () => {
  it("are real codes, each with a currency a company can have", () => {
    expect(new Set(SIGNUP_COUNTRIES).size).toBe(SIGNUP_COUNTRIES.length);
    for (const c of SIGNUP_COUNTRIES) {
      expect(isCountryCode(c), c).toBe(true);
      expect(HOME_CURRENCY_OPTIONS as readonly string[]).toContain(defaultCurrencyFor(c));
    }
  });

  it("offer every country that has its own default currency", () => {
    for (const c of Object.keys(DEFAULT_CURRENCY_BY_COUNTRY)) {
      if (["GG", "JE", "IM"].includes(c)) continue; // Crown dependencies: pick the UK
      expect(SIGNUP_COUNTRIES, c).toContain(c);
    }
  });

  it("chosenCountry reads only a real code from the sign-up metadata", () => {
    expect(chosenCountry({ user_metadata: { country: "NO" } })).toBe("NO");
    expect(chosenCountry({ user_metadata: { country: "ZZ" } })).toBeNull();
    expect(chosenCountry({ user_metadata: {} })).toBeNull();
    expect(chosenCountry({})).toBeNull();
  });

  it("isCountryCode refuses anything else", () => {
    for (const v of ["ZZ", "se", "", null, 7, "SWE"]) expect(isCountryCode(v)).toBe(false);
  });
});
