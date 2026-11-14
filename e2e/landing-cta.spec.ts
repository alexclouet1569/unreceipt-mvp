import { expect, test, type Page } from "@playwright/test";
import { SHOW_PRICES } from "../src/lib/pricing-visibility";

// The public site names no prices while SHOW_PRICES is off (pricing model
// under review, src/lib/pricing-visibility.ts). The price tests below run
// only when it is on; the price-free tests pin the current behaviour.
const PRICES_HIDDEN_REASON =
  "SHOW_PRICES is off: the marketing site shows no pricing section or plan prices";

// A plan price on its own, not the tail of an example receipt's amount
// (the French receipts include "Fnac 129,99 €"): no digit or thousands
// separator right before it.
const price = (text: string) =>
  new RegExp(`(?<![\\d\u00a0\u202f,.])${text.replace(/[.]/g, "\\.").replace(/\s/g, "\\s")}`);

// No pricing section, no nav link to it, and none of the plan prices.
async function expectNoPrices(page: Page, planPrices: readonly RegExp[]) {
  await expect(page.locator("#pricing")).toHaveCount(0);
  await expect(page.locator('a[href="#pricing"]')).toHaveCount(0);
  for (const planPrice of planPrices) {
    await expect(page.locator("body")).not.toContainText(planPrice);
  }
}

/**
 * The landing page now has to close the funnel — every CTA in the hero,
 * the nav, and (while prices are shown) the pricing card must take a cold
 * visitor to /app/login?mode=signup, which opens on "Create account". Pin those routes
 * here so a future copy edit doesn't silently break signup.
 */
test.describe("landing → /app/login funnel", () => {
  test("the hero primary CTA navigates to /app/login", async ({ page }) => {
    await page.goto("/");

    const cta = page.getByRole("link", { name: /Start your free week/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();

    await expect(page).toHaveURL(/\/app\/login\?mode=signup$/);
    // A hero visitor is new: the form opens on "Create account".
    await expect(
      page.getByRole("tab", { name: "Create account" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("button", { name: /^Create account$/i })
    ).toBeVisible();
  });

  test("the nav 'Start free' button navigates to /app/login", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");

    if (isMobile) {
      // Mobile menu is hidden behind the burger.
      await page.getByRole("button").first().click();
    }

    const navCta = page.getByRole("link", { name: /Start free/i }).first();
    await expect(navCta).toBeVisible();
    await navCta.click();

    await expect(page).toHaveURL(/\/app\/login\?mode=signup$/);
  });

  test("the pricing card CTA also routes to /app/login", async ({ page }) => {
    test.skip(!SHOW_PRICES, PRICES_HIDDEN_REASON);
    await page.goto("/");

    // There are multiple "Start your free week" links across the page —
    // pick the one inside the pricing section.
    const pricingSection = page.locator("#pricing");
    const cta = pricingSection
      .locator('[data-plan="Regular"]')
      .getByRole("link", { name: /Start your free week/i });
    await expect(cta).toBeVisible();
    // The section slides into place when scrolled into view; clicking
    // mid-transition lands on whatever was under the old position.
    await pricingSection.scrollIntoViewIfNeeded();
    await expect(pricingSection).toHaveClass(/opacity-100/);
    await pricingSection.evaluate((el) =>
      Promise.all(el.getAnimations().map((a) => a.finished))
    );
    await cta.click();

    await expect(page).toHaveURL(/\/app\/login\?mode=signup$/);
  });

  test("names no prices while SHOW_PRICES is off", async ({ page }) => {
    test.skip(SHOW_PRICES, "prices are shown; the tests below check them");
    await page.goto("/");

    await expectNoPrices(page, ["€5.99", "€14.99", "€29.99", "€0.40"].map(price));
    // The note under the hero buttons uses its price-free wording.
    await expect(page.getByText("First week free. Cancel anytime.")).toBeVisible();
  });

  test("pricing shows the three flat monthly plans with first-week-free", async ({
    page,
  }) => {
    test.skip(!SHOW_PRICES, PRICES_HIDDEN_REASON);
    await page.goto("/");

    const pricing = page.locator("#pricing");
    for (const [name, price] of [
      ["Light", "€5.99"],
      ["Regular", "€14.99"],
      ["Heavy", "€29.99"],
    ]) {
      const card = pricing.locator(`[data-plan="${name}"]`);
      await expect(card).toContainText(price);
      await expect(card).toContainText(/receipts \/ month/i);
    }
    await expect(pricing).not.toContainText(/per employee/i);
    await expect(pricing).toContainText(/VAT/);
    await expect(pricing).toContainText(/First week free/i);
  });

  test("the receipts slider highlights the plan that fits", async ({
    page,
  }) => {
    test.skip(!SHOW_PRICES, PRICES_HIDDEN_REASON);
    await page.goto("/");

    const pricing = page.locator("#pricing");
    // Retry until the client component has hydrated and owns the input.
    await expect(async () => {
      await pricing.locator("#receipts-per-month").fill("30");
      await expect(pricing.getByTestId("plan-fit")).toContainText("Regular", {
        timeout: 500,
      });
    }).toPass();
    await expect(pricing.locator('[data-plan="Regular"]')).toHaveAttribute("data-fits", "");
  });
});

test.describe("landing waitlist (demoted)", () => {
  test("posts a fake email and shows the on-the-list state", async ({
    page,
  }) => {
    // Stub the API so the test doesn't depend on a real Supabase / Resend.
    await page.route("**/api/waitlist", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ message: "Welcome to the waitlist!" }),
      })
    );

    await page.goto("/");

    // The English page ends with the waitlist form (the Swedish and French
    // pages end with a sign-up button instead). There is no jump link to it.
    const waitlist = page.locator("#waitlist");
    await waitlist.scrollIntoViewIfNeeded();

    await waitlist.getByPlaceholder("your@company.com").fill("test@example.com");
    await waitlist.getByRole("button", { name: /Notify me/i }).click();

    await expect(
      page.getByText(/You.?re on the list/i)
    ).toBeVisible();
  });
});

test.describe("Swedish landing (/sv)", () => {
  test("is in Swedish, and links both languages", async ({ page }) => {
    await page.goto("/sv");

    await expect(page.locator("html")).toHaveAttribute("lang", "sv");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://unreceipt.com/sv"
    );
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      "href",
      "https://unreceipt.com"
    );
    // The h1 carries the search words; the slogan sits below it.
    await expect(page.locator("h1")).toHaveText(
      "Kvittohantering för småföretag, enskild firma och redovisningsbyråer"
    );
    await expect(page.getByText("Från kaos", { exact: false }).first()).toBeVisible();

    await expect(page.locator("#faq")).toContainText("Hur länge måste företag spara kvitton?");

    // The language switch goes back to English.
    await expect(page.locator('footer a[hreflang="en"]')).toHaveAttribute("href", "/");
  });

  test("prices in kronor", async ({ page }) => {
    test.skip(!SHOW_PRICES, PRICES_HIDDEN_REASON);
    await page.goto("/sv");
    const pricing = page.locator("#pricing");
    for (const [name, price] of [
      ["Light", "69 kr"],
      ["Regular", "169 kr"],
      ["Heavy", "329 kr"],
    ]) {
      await expect(pricing.locator(`[data-plan="${name}"]`)).toContainText(price);
    }
    await expect(pricing).not.toContainText("€");
  });

  test("names no prices while SHOW_PRICES is off", async ({ page }) => {
    test.skip(SHOW_PRICES, "prices are shown; the test above checks them");
    await page.goto("/sv");
    await expectNoPrices(page, ["69 kr", "169 kr", "329 kr", "4,90 kr"].map(price));
    await expect(page.getByText("Första veckan gratis. Avsluta när du vill.")).toBeVisible();
  });

  test("the hero CTA navigates to /app/login", async ({ page }) => {
    await page.goto("/sv");
    const cta = page.getByRole("link", { name: /Prova gratis i en vecka/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/app\/login\?mode=signup$/);
  });
});

test.describe("French landing (/fr)", () => {
  test("is in French, and links every language", async ({ page }) => {
    await page.goto("/fr");

    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://unreceipt.com/fr"
    );
    await expect(page.locator('link[rel="alternate"][hreflang="sv"]')).toHaveAttribute(
      "href",
      "https://unreceipt.com/sv"
    );
    await expect(page.locator("h1")).toHaveText(
      "Gestion des justificatifs pour TPE, indépendants et experts-comptables"
    );
    await expect(page.getByText("Du chaos", { exact: false }).first()).toBeVisible();

    await expect(page.locator("#faq")).toContainText("Puis-je jeter le ticket papier");

    await expect(page.locator('footer a[hreflang="en"]')).toHaveAttribute("href", "/");
    await expect(page.locator('footer a[hreflang="sv"]')).toHaveAttribute("href", "/sv");
  });

  test("prices in euros", async ({ page }) => {
    test.skip(!SHOW_PRICES, PRICES_HIDDEN_REASON);
    await page.goto("/fr");
    const pricing = page.locator("#pricing");
    for (const [name, price] of [
      ["Light", /5,99\s€/],
      ["Regular", /14,99\s€/],
      ["Heavy", /29,99\s€/],
    ] as const) {
      await expect(pricing.locator(`[data-plan="${name}"]`)).toContainText(price);
    }
    await expect(pricing).not.toContainText("kr");
  });

  test("names no prices while SHOW_PRICES is off", async ({ page }) => {
    test.skip(SHOW_PRICES, "prices are shown; the test above checks them");
    await page.goto("/fr");
    await expectNoPrices(page, ["5,99 €", "14,99 €", "29,99 €", "0,40 €"].map(price));
    await expect(page.getByText("Première semaine gratuite. Sans engagement.")).toBeVisible();
  });

  test("the hero CTA navigates to /app/login", async ({ page }) => {
    await page.goto("/fr");
    const cta = page.getByRole("link", { name: /Essayer gratuitement une semaine/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/app\/login\?mode=signup$/);
  });
});
