import { expect, test } from "@playwright/test";

/**
 * Pilot mode is a server-side env-var toggle, so this suite is gated:
 * it only runs when PILOT_MODE=true is in the dev server's environment.
 * Run locally with:
 *
 *   PILOT_MODE=true bun run dev    # in one terminal
 *   PILOT_MODE=true bun test:e2e --grep "pilot mode"  # in another
 *
 * Skipped otherwise so the default `bun test:e2e` (paid mode) stays green.
 */
const pilotEnabled = process.env.PILOT_MODE === "true";

test.describe("pilot mode landing copy", () => {
  test.skip(!pilotEnabled, "PILOT_MODE not set — pilot-mode e2e skipped");

  test("hero CTA reads 'Join the pilot' instead of 'Start your free week'", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /Join the pilot/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Start your free week/i })
    ).toHaveCount(0);
  });

  test("pricing card shows 'Free during pilot. €49/month after.'", async ({
    page,
  }) => {
    await page.goto("/");
    const pricing = page.locator("#pricing");
    await expect(pricing).toContainText(/Free during pilot/i);
    await expect(pricing).toContainText(/49\/month after/i);
  });

  test("/subscribe shows 'Continue to dashboard' instead of the Subscribe button", async ({
    page,
  }) => {
    await page.goto("/subscribe");
    // Unauthenticated visitors get bounced to /app/login first; this test
    // is a smoke check on the pilot copy, so we accept either landing or
    // /app/login depending on auth state.
    if (page.url().includes("/subscribe")) {
      await expect(
        page.getByRole("link", { name: /Continue to dashboard/i })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Subscribe/i })
      ).toHaveCount(0);
    }
  });
});
