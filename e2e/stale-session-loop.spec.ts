import { expect, test, type Page } from "@playwright/test";

/**
 * Regression: a deleted user with stale sb-* cookies in the browser
 * triggered an infinite redirect loop on /app/login (CSC ticket
 * "page restarts every time I type"). Symptoms:
 *
 *  1. ClientShell's onAuthStateChange fired INITIAL_SESSION with the
 *     stale JWT (truthy session.user) and replace()'d to /app.
 *  2. The server gate's getServerUser() validated against the API,
 *     saw "user not found", redirected back to /app/login.
 *  3. Cookies still present → step 1 again.
 *
 * Fix is twofold: ClientShell now validates via getUser() before
 * trusting the session payload AND signs out on failure (clearing
 * cookies); getServerUser() additionally calls signOut() when sb-*
 * cookies are present but the user is gone (defense in depth — works
 * in route handler / server action contexts; server-component cookie
 * writes are a no-op so the client-side path is the load-bearing
 * fix).
 */

const FAKE_HOST = "https://test.supabase.co";

const stubGoneUser = async (page: Page) => {
  // /auth/v1/user always 401 with a "user does not exist" payload —
  // matches what Supabase returns for a deleted user whose JWT is
  // still floating around in the client.
  await page.route(/^https:\/\/test\.supabase\.co\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/v1/user")) {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          message: "User from sub claim in JWT does not exist",
        }),
      });
    }
    if (path.endsWith("/auth/v1/logout")) {
      return route.fulfill({
        status: 204,
        contentType: "application/json",
        body: "",
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
};

// A syntactically valid JWT with `sub` claim — supabase-js parses
// the payload locally and surfaces session.user without round-
// tripping. Header + payload + dummy signature, base64url'd.
//
// Header: { alg: "HS256", typ: "JWT" }
// Payload: { sub: "00000000-0000-0000-0000-000000000000",
//            email: "deleted@example.com", role: "authenticated",
//            aud: "authenticated", exp: 9999999999 }
const FAKE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  "." +
  "eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAi" +
  "LCJlbWFpbCI6ImRlbGV0ZWRAZXhhbXBsZS5jb20iLCJyb2xlIjoiYXV0aGVu" +
  "dGljYXRlZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjk5OTk5OTk5" +
  "OTl9" +
  "." +
  "ZmFrZS1zaWduYXR1cmU";

const seedStaleCookie = async (page: Page, baseURL: string) => {
  const url = new URL(baseURL);
  // Mirror the cookie shape @supabase/ssr writes.
  await page.context().addCookies([
    {
      name: "sb-test-auth-token",
      value: encodeURIComponent(
        JSON.stringify({
          access_token: FAKE_JWT,
          refresh_token: "fake-refresh",
          expires_at: 9999999999,
          token_type: "bearer",
          user: {
            id: "00000000-0000-0000-0000-000000000000",
            email: "deleted@example.com",
            aud: "authenticated",
          },
        })
      ),
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
};

test.describe("stale-session redirect loop", () => {
  test("/app/login does not redirect-loop with a stale auth cookie", async ({
    page,
    baseURL,
  }) => {
    await stubGoneUser(page);
    await seedStaleCookie(page, baseURL ?? "http://localhost:3000");

    // Track every navigation so we can assert there's no oscillation
    // between /app and /app/login.
    const visitedPaths: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        visitedPaths.push(new URL(frame.url()).pathname);
      }
    });

    await page.goto("/app/login");

    // Give ClientShell's onAuthStateChange + getUser round-trip time
    // to run. If it loops, we'd see /app/login → /app → /app/login → …
    // appended over the next second.
    await page.waitForTimeout(1500);

    expect(page).toHaveURL(/\/app\/login$/);

    // The page is interactive — the user can focus the email input
    // without the page "restarting".
    const emailField = page.getByLabel(/Email address/i).first();
    await expect(emailField).toBeVisible();
    await emailField.fill("alex@example.se");
    await expect(emailField).toHaveValue("alex@example.se");

    // The path history should have at most ONE bounce — it is OK if
    // ClientShell briefly replaced to /app/login from somewhere else,
    // but it must not be bouncing back and forth to /app.
    const appBounces = visitedPaths.filter((p) => p === "/app").length;
    expect(appBounces).toBeLessThanOrEqual(1);
  });
});
