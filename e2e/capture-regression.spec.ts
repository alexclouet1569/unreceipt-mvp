import { test, expect, type Page } from "@playwright/test";

/**
 * Regression baseline for the existing self-service capture surface.
 *
 * Today the capture dialog (src/app/app/page.tsx) is wired to a client-side
 * `simulateOCR()` stub and a `transactions` state that is initialized to []
 * and never populated from any data source. The dialog is therefore
 * unreachable in the running app — there is no transaction in
 * `receipt_needed` state to click. The regression coverage below pins the
 * surface that DOES execute today: the auth gate redirect and the
 * magic-link login form. When step 2+ of the WOZ plan lands real data
 * loading + a working capture/save path, this spec should be extended to
 * exercise the dialog end-to-end.
 */

const stubSupabase = async (
  page: Page,
  opts: { user?: { id: string; email: string } | null; otpOk?: boolean } = {}
) => {
  const user = opts.user ?? null;
  const otpOk = opts.otpOk ?? true;

  await page.route("**/auth/v1/user**", (route) => {
    if (user) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: user.id,
          aud: "authenticated",
          email: user.email,
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        }),
      });
    } else {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Auth session missing" }),
      });
    }
  });

  await page.route("**/auth/v1/otp**", (route) => {
    route.fulfill({
      status: otpOk ? 200 : 400,
      contentType: "application/json",
      body: otpOk ? "{}" : JSON.stringify({ error: "boom" }),
    });
  });
};

test.describe("self-service capture regression", () => {
  test("unauthenticated /app redirects to /app/login", async ({ page }) => {
    await stubSupabase(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/login$/);
  });

  test("/app/login renders the magic-link form", async ({ page }) => {
    await stubSupabase(page);
    await page.goto("/app/login");

    await expect(page.getByRole("heading", { name: "UnReceipt" })).toBeVisible();
    await expect(page.getByText("Sign in to manage your receipts")).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Send Magic Link/i })
    ).toBeVisible();
  });

  test("magic-link submit shows the check-your-email state", async ({ page }) => {
    await stubSupabase(page, { otpOk: true });
    await page.goto("/app/login");

    await page.getByPlaceholder("you@company.com").fill("test@unreceipt.io");
    await page.getByRole("button", { name: /Send Magic Link/i }).click();

    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText("test@unreceipt.io")).toBeVisible();
  });

  test("authenticated /app renders the dashboard empty state", async ({ page }) => {
    await stubSupabase(page, {
      user: { id: "11111111-1111-1111-1111-111111111111", email: "test@unreceipt.io" },
    });

    // Seed a Supabase session in localStorage so the SDK skips the network
    // session-missing path and treats the user as authenticated.
    await page.addInitScript(() => {
      const session = {
        access_token: "fake-access-token",
        refresh_token: "fake-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: "11111111-1111-1111-1111-111111111111",
          aud: "authenticated",
          email: "test@unreceipt.io",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      };
      window.localStorage.setItem("sb-test-auth-token", JSON.stringify(session));
    });

    await page.goto("/app");

    await expect(page.getByRole("heading", { name: "Your Expenses" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible();
    // Sign-out control is the public exit from this view; pin it as part of the surface.
    await expect(page.getByRole("button", { name: /Sign out/i })).toBeVisible();
  });
});
