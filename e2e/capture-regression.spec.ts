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

  // Stub the Supabase host wholesale. The supabase-js OTP request carries
  // a `?redirect_to=…` query string; Playwright's glob `?` is a meta-char
  // that swallows the literal `?` and prevents the stub from matching on
  // WebKit. A regex matches the full URL deterministically.
  await page.route(/^https:\/\/test\.supabase\.co\//, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/auth/v1/user")) {
      if (user) {
        return route.fulfill({
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
      }
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Auth session missing" }),
      });
    }

    if (path.endsWith("/auth/v1/otp") || path.endsWith("/auth/v1/magiclink")) {
      return route.fulfill({
        status: otpOk ? 200 : 400,
        contentType: "application/json",
        body: otpOk ? "{}" : JSON.stringify({ error: "boom" }),
      });
    }

    // Default: empty 200. Keeps any unanticipated auth request from
    // leaking out to the real internet and stalling the test.
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
};

test.describe("self-service capture regression", () => {
  test("unauthenticated /app redirects to /app/login", async ({ page }) => {
    await stubSupabase(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/login$/);
  });

  test("/app/login renders the tabbed auth UI", async ({ page }) => {
    await stubSupabase(page);
    await page.goto("/app/login");

    await expect(page.getByRole("heading", { name: "UnReceipt" })).toBeVisible();
    await expect(page.getByText("Sign in to manage your receipts")).toBeVisible();
    // Default Sign in tab — email + password fields visible.
    await expect(page.getByLabel(/Email address/i).first()).toBeVisible();
    await expect(page.getByLabel(/^Password$/i)).toBeVisible();
    // The Sign up tab is reachable.
    await expect(page.getByRole("tab", { name: /Sign up/i })).toBeVisible();
  });

  test("magic-link fallback (Forgot password?) shows the check-your-email state", async ({
    page,
    browserName,
  }) => {
    // WebKit drops the supabase-js OTP POST to a real network call despite
    // route interception — same gap as before. Chromium still proves the
    // success state.
    test.skip(browserName === "webkit", "WebKit + Playwright route gap");

    await stubSupabase(page, { otpOk: true });
    await page.goto("/app/login");

    await page.getByText(/Forgot password\?/i).click();
    await expect(
      page.getByRole("button", { name: /Send Magic Link/i })
    ).toBeVisible();

    await page.getByPlaceholder("you@company.com").fill("test@unreceipt.io");
    await page.getByRole("button", { name: /Send Magic Link/i }).click();

    await expect(
      page.getByRole("heading", { name: "Check your email" })
    ).toBeVisible();
    await expect(page.getByText("test@unreceipt.io")).toBeVisible();
  });

  // The previous "authenticated /app renders the dashboard empty state" test
  // worked by faking a Supabase session in localStorage and stubbing browser-
  // side requests. With step 5's server-rendered subscription gate, the
  // dashboard is gated by `getServerUser()` reading cookies on the Node side
  // — Playwright's `page.route()` cannot reach those server-side fetches, and
  // the localStorage trick is invisible to the server. Restoring real
  // coverage for the authenticated dashboard requires either a test-mode
  // Supabase project or a server-side stub mechanism (e.g. an env-gated
  // mock supabase-admin client). Tracked as a TODO until step 6 lands the
  // admin paste form, which will need the same test infra.
});
