import { expect, test } from "@playwright/test";

/**
 * The landing page now has to close the funnel — every CTA in the hero,
 * the nav, and the pricing card must take a cold visitor to /app/login
 * (sign-in-first flow per plan A3). Pin those routes here so a future
 * copy edit doesn't silently break signup.
 */
test.describe("landing → /app/login funnel", () => {
  test("the hero primary CTA navigates to /app/login", async ({ page }) => {
    await page.goto("/");

    const cta = page.getByRole("link", { name: /Start your free week/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();

    await expect(page).toHaveURL(/\/app\/login$/);
    await expect(
      page.getByRole("button", { name: /Send Magic Link/i })
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

    await expect(page).toHaveURL(/\/app\/login$/);
  });

  test("the pricing card CTA also routes to /app/login", async ({ page }) => {
    await page.goto("/");

    // There are multiple "Start your free week" links across the page —
    // pick the one inside the pricing section.
    const pricingSection = page.locator("#pricing");
    const cta = pricingSection.getByRole("link", {
      name: /Start your free week/i,
    });
    await expect(cta).toBeVisible();
    await cta.click();

    await expect(page).toHaveURL(/\/app\/login$/);
  });

  test("pricing copy reads €49 + VAT with first-week-free, not the old freemium tiers", async ({
    page,
  }) => {
    await page.goto("/");

    const pricing = page.locator("#pricing");
    await expect(pricing).toContainText("One simple plan");
    await expect(pricing).toContainText(/49/);
    await expect(pricing).toContainText(/VAT/);
    await expect(pricing).toContainText(/First week free/i);

    // The old 3-tier copy must be gone.
    await expect(pricing).not.toContainText(/Most Popular/i);
    await expect(pricing).not.toContainText(/Enterprise/i);
    await expect(pricing).not.toContainText(/forever/i);
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

    // Scroll the waitlist section into view; jump-link is friendlier than
    // a manual scroll on small viewports.
    await page.locator('a[href="#waitlist"]').first().click().catch(() => {});
    const waitlist = page.locator("#waitlist");
    await waitlist.scrollIntoViewIfNeeded();

    await waitlist.getByPlaceholder("your@company.com").fill("test@example.com");
    await waitlist.getByRole("button", { name: /Notify me/i }).click();

    await expect(
      page.getByText(/You.?re on the list/i)
    ).toBeVisible();
  });
});
